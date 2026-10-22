import "server-only";
import { armarRespuestaVivo, compactarEvento, conRegistro, esClase, fechaCOT, indexarRegistroVivo, indexarRosterVivo, ventanaAbiertaAhora, ventanaClase, COT_MS } from "../vivoCalculo.mjs";
import type { EventoVivo, FranjaVivo, IdentidadRosterVivo, SalaVivo, VivoResponse } from "../vivoCalculo.d.mts";
import { supabaseServidor } from "./supabase";
import { compactarPresentes } from "../zoomPresentes.mjs";
import { presentesZoom } from "./zoomEnVivo";

// TOC-142, pestana "En vivo": UNICO punto de acople con Supabase. Devuelve solo CONTEOS (ver lib/vivoCalculo.mjs).
// Egress (Supabase ya ~2,9/5 GB):
//  - Sin clase en ventana: 0 lecturas de zoom_live_log (solo la franja del dia, cache largo).
//  - En ventana de clase: lectura INCREMENTAL (id > ultimo leido, con un pequeno solape y dedupe por id) + zoom_reuniones_activas
//    (activo=true, pocas filas). Resultado cacheado TTL_CACHE_VIVO_MS compartido por todos los visitantes.
//  - Al cerrar la ultima ventana del dia se hace UN ultimo refresco (los eventos entre el ultimo sondeo y el cierre).
//  - Instancia en frio fuera de ventana: NO se lee el dia completo (en un sabado serian ~1.300 eventos de clase por dia, ~0,3 MB o mas por
//    arranque en frio: ver ESTADO.md); las clases terminadas salen con aviso "cifra no disponible" y sin burbujas.
//  - Identidad igual que "Lista en vivo" (fase 1.4): correo del roster y, si no, cedula del registro de Zoom del dia. zoom_registrantes
//    se lee SOLO en ventana de clase (o en el ultimo refresco), solo correo_norm,cedula_digitos de fecha_sesion = hoy, con cache de
//    TTL_REGISTRO_MS (el sync corre cada hora a las :40); si esa lectura falla se sigue con el registro anterior (o solo correo) y aviso.
//  - El estado en memoria guarda hashes de correo/nombre/cedula, nunca el texto. Un fallo no se cachea (el llamador responde 503).
//  - TOC-153: con una clase en ventana se piden en paralelo los participantes EN VIVO de Zoom (lib/servidor/zoomEnVivo.ts, cache
//    propio de 20 s); se compactan a hashes al llegar y corrigen los *_ahora_aprox. Si Zoom falla, se sigue con webhooks y aviso.
const PAGINA = 1000;
const MAX_PAGINAS = 6;           // tope de filas por lectura incremental (6.000)
const MAX_SALAS = 24;            // tope de salas de clase rastreadas por dia
const SOLAPE_IDS = 25;           // el webhook puede confirmar ids fuera de orden: se relee un poco hacia atras
const MAX_INTENTOS_META = 3;     // por sala: un intento por refresco; tras 3 se deja con host null y el cursor sigue
export const TTL_CACHE_VIVO_MS = 30_000; // egress: el cliente sondea cada 45 s (lib/vivoVista.mjs INTERVALO_MS)
export const TTL_BASE_MS = 10 * 60_000; // franjas del dia y roster: cambian una vez por semana
export const TTL_REGISTRO_MS = 5 * 60_000; // zoom_registrantes del dia (igual que Lista en vivo)

type FilaFranja = FranjaVivo;
type SalaEstado = { uuid: string; host: string | null; topic: string | null; activo: boolean; actualizado: number | null; eventos: Map<number, EventoVivo>;
  metaOk: boolean; intentosMeta: number };
type Roster = IdentidadRosterVivo; // hashes: correo -> persona, cedula -> persona, persona -> slot_id de sus franjas de la semana
type Registro = { dia: string; ms: number; idx: Map<string, string | null> }; // hash(correo) -> hash(cedula) del registro de Zoom
type Base = { lunes: string; cargadoMs: number; franjas: FilaFranja[] | null; roster: Roster | null; rosterMs: number };
// cargado: ya hubo al menos un refresco completo del dia (hay cifras en memoria). ultimoRefrescoMs: hora del ultimo refresco.
// cerrado: ya se hizo el ULTIMO refresco tras terminar la ultima ventana del dia.
type Vivo = { dia: string; cursor: number; salas: Map<string, SalaEstado>; cargado: boolean; ultimoRefrescoMs: number; cerrado: boolean };

let base: Base | null = null;
let vivo: Vivo | null = null;
let registro: Registro | null = null;
let cache: { ms: number; data: VivoResponse } | null = null;
let enCurso: Promise<VivoResponse> | null = null;
let ultimaLecturaMs = 0; // hora REAL de la ultima consulta a Supabase (alimenta actualizado_en)

// Tiempo limite de una lectura compartida (sabado 2026-10-10): si una consulta a Supabase se cuelga (caida de red/DNS sin
// respuesta), la promesa en vuelo nunca terminaba y TODAS las lecturas siguientes la esperaban: la pantalla quedaba congelada
// hasta reiniciar el servidor. Con el limite, la lectura falla, se libera `enCurso` y la siguiente vuelve a leer.
export const LIMITE_LECTURA_MS = 20_000;
function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export function vaciarCacheVivo() { base = null; vivo = null; registro = null; cache = null; enCurso = null; ultimaLecturaMs = 0; }
export function estadoVivoParaPruebas() { return vivo ? { cursor: vivo.cursor, cerrado: vivo.cerrado, cargado: vivo.cargado } : null; }

const lunesDe = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

async function leerPaginado<T>(construir: () => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const salida: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await construir().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    salida.push(...lote);
    if (lote.length < PAGINA) return salida;
  }
  return salida;
}

async function cargarFranjas(lunes: string): Promise<FilaFranja[] | null> {
  const sb = supabaseServidor();
  const { data: sem, error } = await sb.from("asist_semanas").select("semana").eq("semana", lunes).limit(1);
  if (error) throw error;
  if (!(sem ?? []).length) return null;
  return leerPaginado<FilaFranja>(() => sb.from("asist_franjas")
    .select("slot_id,dia,fecha,hora_inicio,hora_fin,tipo,cuenta_zoom,roster_n").eq("semana", lunes).order("slot_id", { ascending: true }));
}

// El roster se carga CON slot_id (roster de ESTA clase frente a "otra franja") y persona_id (para cruzar la cedula del registro de
// Zoom). Mismas filas que antes; se hashea al leer y las filas se descartan.
async function cargarRoster(lunes: string): Promise<Roster> {
  const sb = supabaseServidor();
  const filas = await leerPaginado<{ persona_id: string | null; correo_norm: string | null; slot_id: string | null }>(() => sb.from("asist_roster")
    .select("persona_id,correo_norm,slot_id").eq("semana", lunes).order("persona_id", { ascending: true }).order("slot_id", { ascending: true }));
  return indexarRosterVivo(filas);
}

async function cargarRegistro(dia: string): Promise<Map<string, string | null>> {
  const sb = supabaseServidor();
  const filas = await leerPaginado<{ correo_norm: string | null; cedula_digitos: string | null }>(() => sb.from("v_asist_registrantes_panel")
    .select("correo_norm,cedula_digitos").eq("fecha_sesion", dia).order("registrant_id", { ascending: true }));
  return indexarRegistroVivo(filas);
}

function salaVacia(uuid: string): SalaEstado {
  return { uuid, host: null, topic: null, activo: false, actualizado: null, eventos: new Map(), metaOk: false, intentosMeta: 0 };
}

async function refrescarVivo(dia: string, ahoraMs: number): Promise<{ truncado: boolean }> {
  const sb = supabaseServidor();
  if (!vivo || vivo.dia !== dia) vivo = { dia, cursor: 0, salas: new Map(), cargado: false, ultimoRefrescoMs: 0, cerrado: false };
  const inicioDia = Date.parse(`${dia}T00:00:00Z`) + COT_MS;
  // 1) salas activas ahora (tabla pequena)
  const activas = await leerPaginado<{ uuid: string; host: string | null; topic: string | null; actualizado_en: string | null }>(() =>
    sb.from("zoom_reuniones_activas").select("uuid,host,topic,actualizado_en").eq("activo", true).order("uuid", { ascending: true }));
  // 2) eventos nuevos (solo de clases), incremental
  const desdeId = Math.max(0, vivo.cursor - SOLAPE_IDS);
  const filas = await leerPaginado<{ id: number; evento: string; correo: string | null; nombre: string | null; hora_ms: number; uuid: string | null; curso: string | null }>(() =>
    sb.from("v_asist_zoom_live_panel").select("id,evento,correo,nombre,hora_ms,uuid,curso")
      .in("evento", ["joined", "left"]).gt("id", desdeId).gte("hora_ms", inicioDia)
      .or("curso.ilike.BACKEND*,curso.ilike.DESARROLLO*WEB*").order("id", { ascending: true }));
  let truncado = filas.length >= MAX_PAGINAS * PAGINA;
  let cursorNuevo = vivo.cursor; // el cursor SOLO se aplica al final, cuando la meta de las salas quedo resuelta o agotada
  const tope = (uuid: string) => vivo!.salas.has(uuid) || vivo!.salas.size < MAX_SALAS;
  for (const f of filas) {
    if (!f.uuid || !esClase(f.curso)) continue;
    if (!tope(f.uuid)) { truncado = true; continue; }
    let s = vivo.salas.get(f.uuid);
    if (!s) { s = salaVacia(f.uuid); s.topic = f.curso; vivo.salas.set(f.uuid, s); }
    s.eventos.set(Number(f.id), compactarEvento(f));
    if (Number(f.id) > cursorNuevo) cursorNuevo = Number(f.id);
  }
  // 3) metadatos (host/topic): primero de las activas
  for (const a of activas) {
    if (!esClase(a.topic)) continue;
    if (!tope(a.uuid)) { truncado = true; continue; }
    const s = vivo.salas.get(a.uuid) ?? salaVacia(a.uuid);
    s.host = a.host; s.topic = a.topic ?? s.topic; s.actualizado = a.actualizado_en ? Date.parse(a.actualizado_en) : null; s.metaOk = true;
    vivo.salas.set(a.uuid, s);
  }
  const activasSet = new Set(activas.map((a) => a.uuid));
  for (const s of vivo.salas.values()) s.activo = activasSet.has(s.uuid) && (s.eventos.size > 0 || (s.actualizado != null && s.actualizado >= inicioDia));
  // 4) salas sin meta (no estan entre las activas): UN reintento por sala y por refresco, en una sola consulta acotada a MAX_SALAS.
  //    Si la consulta falla no se pierde nada: el cursor no avanza (los eventos se releen, el dedupe por id los absorbe) y la sala se
  //    reintenta en el siguiente refresco, hasta MAX_INTENTOS_META.
  const sinMeta = [...vivo.salas.values()].filter((s) => !s.metaOk && s.intentosMeta < MAX_INTENTOS_META).slice(0, MAX_SALAS);
  if (sinMeta.length) {
    for (const s of sinMeta) s.intentosMeta += 1;
    try {
      const filasMeta = await leerPaginado<{ uuid: string; host: string | null; topic: string | null }>(() =>
        sb.from("zoom_reuniones_activas").select("uuid,host,topic").in("uuid", sinMeta.map((s) => s.uuid)).order("uuid", { ascending: true }));
      for (const m of filasMeta) { const s = vivo.salas.get(m.uuid); if (s) { s.host = m.host; s.topic = m.topic ?? s.topic; s.metaOk = true; } }
    } catch { /* fallo parcial: no se aborta el refresco; se reintenta en el siguiente */ }
  }
  const pendiente = [...vivo.salas.values()].some((s) => !s.metaOk && s.intentosMeta < MAX_INTENTOS_META);
  if (!pendiente) vivo.cursor = cursorNuevo;
  vivo.cargado = true; vivo.ultimoRefrescoMs = ahoraMs;
  return { truncado };
}

function salasDeMemoria(dia: string): SalaVivo[] {
  if (!vivo || vivo.dia !== dia) return [];
  return [...vivo.salas.values()].filter((s) => esClase(s.topic) && (s.eventos.size > 0 || s.activo))
    .map((s) => ({ uuid: s.uuid, host: s.host, topic: s.topic, activo: s.activo, eventos: [...s.eventos.values()] }));
}

async function calcular(ahoraMs: number): Promise<VivoResponse> {
  const dia = fechaCOT(ahoraMs);
  const lunes = lunesDe(dia);
  if (!base || base.lunes !== lunes || ahoraMs - base.cargadoMs > TTL_BASE_MS) {
    base = { lunes, cargadoMs: ahoraMs, franjas: await cargarFranjas(lunes), roster: null, rosterMs: 0 };
    ultimaLecturaMs = ahoraMs;
  }
  const vacio = (aviso: string): VivoResponse => ({ disponible: false, actualizado_en: new Date(ultimaLecturaMs || ahoraMs).toISOString(), semana: lunes,
    hora_servidor: new Date(ahoraMs).toISOString(), clases: [], aviso_general: aviso });
  if (!base.franjas) return vacio("La semana actual todavía no está congelada: no hay clases para mostrar.");
  const franjas = base.franjas;
  const hoy = franjas.filter((f) => f.fecha === dia);
  const hayVentana = hoy.some((f) => ventanaAbiertaAhora(f, ahoraMs));
  // ULTIMO refresco: la primera vez que se pasa el cierre de una ventana se leen los eventos que llegaron entre el ultimo refresco y el
  // cierre (hasta ahi llegaba el sondeo). Solo si ya habia memoria del dia; despues de la ultima ventana del dia queda "cerrado".
  const cerroVentana = vivo?.dia === dia && vivo.cargado && hoy.some((f) => ahoraMs > ventanaClase(f).hastaMs && vivo!.ultimoRefrescoMs <= ventanaClase(f).hastaMs);
  let avisoGeneral: string | null = null;
  let avisoRegistro: string | null = null;
  let presentesPorSala: Map<string, EventoVivo[]> | null = null;
  if (hayVentana || cerroVentana) {
    const zoomEnCurso = hayVentana ? presentesZoom(ahoraMs) : null; // nunca lanza
    if (!base.roster || ahoraMs - base.rosterMs > TTL_BASE_MS) { base.roster = await cargarRoster(lunes); base.rosterMs = ahoraMs; }
    if (!registro || registro.dia !== dia || ahoraMs - registro.ms > TTL_REGISTRO_MS) {
      try { registro = { dia, ms: ahoraMs, idx: await cargarRegistro(dia) }; }
      catch { avisoRegistro = "No se pudo leer el registro de Zoom: quien entró con un correo distinto al del roster puede salir como desconocido."; }
    }
    const { truncado } = await refrescarVivo(dia, ahoraMs);
    ultimaLecturaMs = ahoraMs;
    const zoom = zoomEnCurso ? await zoomEnCurso : null;
    if (zoom?.salas) presentesPorSala = new Map([...zoom.salas].map(([uuid, ps]) => [uuid, compactarPresentes(ps)]));
    const avisoZoom = zoom && (zoom.estado === "fallo" || zoom.estado === "limite") ? "Zoom no respondió: «ahora en sala» sale solo de los webhooks y puede contar de menos." : null;
    if (truncado) avisoGeneral = "Hay más salas o eventos de los que se leen; las cifras pueden estar incompletas.";
    avisoGeneral = [avisoGeneral, avisoRegistro, avisoZoom].filter(Boolean).join(" ") || null;
    if (vivo && !hayVentana && hoy.every((f) => ahoraMs > ventanaClase(f).hastaMs)) vivo.cerrado = true;
  }
  const memoriaDelDia = vivo?.dia === dia && vivo.cargado;
  return armarRespuestaVivo({ semana: lunes, franjas: hoy, salas: salasDeMemoria(dia), rosterPorCorreo: conRegistro(base.roster ?? indexarRosterVivo([]), registro?.dia === dia ? registro.idx : null),
    ahoraMs, actualizadoMs: ultimaLecturaMs || ahoraMs, lecturaEventos: memoriaDelDia, avisoGeneral, presentesPorSala });
}

// El llamador (ruta) ya paso exigirAcceso. Un fallo lanza (no se cachea).
export async function leerVivo(ahoraMs: number = Date.now()): Promise<VivoResponse> {
  // Desde cache: cifras y actualizado_en son los de la lectura real; hora_servidor es AHORA (la pantalla suma la diferencia a la edad).
  if (cache && ahoraMs - cache.ms < TTL_CACHE_VIVO_MS && ahoraMs >= cache.ms) return { ...cache.data, hora_servidor: new Date(ahoraMs).toISOString() };
  if (enCurso) return enCurso;
  const p = conTiempoLimite(calcular(ahoraMs)).then((data) => { cache = { ms: ahoraMs, data }; return data; }).finally(() => { enCurso = null; });
  enCurso = p;
  return p;
}
