import "server-only";
import { armarRespuestaVivo, compactarEvento, conRegistro, estadoClase, fechaCOT, hashRegistrante, indexarRegistroIdVivo, indexarRegistroVivo, indexarRosterVivo,
  ventanaAbiertaAhora, ventanaClase, COT_MS } from "../vivoCalculo.mjs";
import type { EventoVivo, FranjaVivo, IdentidadRosterVivo, SalaVivo, VivoResponse } from "../vivoCalculo.d.mts";
import { asociarSalaJcon, COHORTE_JCON, esClaseJcon, etiquetaJcon, franjasJcon, lunesDe, PROGRAMA_JCON, rosterJcon } from "../vivoJcon.mjs";
import type { EstudianteJcon, GrupoJcon } from "../vivoJcon.d.mts";
import { supabaseServidor } from "./supabase";
import { compactarPresentes } from "../zoomPresentes.mjs";
import { presentesZoom } from "./zoomEnVivo";

// TOC-208: JC-ON en la pestana «En vivo». Lector PARALELO a leerVivo.ts (JC), con su propio estado en memoria: nada de aqui toca el
// estado, el cache ni las cifras de JC, y nada de JC entra aqui. Misma semantica y mismas funciones puras (lib/vivoCalculo.mjs):
//  - franjas SINTETICAS (lib/vivoJcon.mjs): viernes 10-12 grupo V y sabado 14-16 grupo S de la semana actual; no dependen de asist_franjas
//    ni de que la semana de JC este congelada.
//  - roster desde jcon.estudiantes (solo 'activo'; persona_id = cedula; slot segun horario). Un JC-ON del OTRO grupo = «colado».
//  - eventos: la misma vista v_asist_zoom_live_panel, filtrada por curso ilike %JCON% y por tema (grupoJcon), con cursor propio.
//  - sala -> franja por TEMA (asociarSalaJcon), no por cuenta+hora.
//  - identidad igual que JC: correo del roster -> registrant_id del evento cruzado con zoom_registrantes -> cedula del registro de Zoom
//    del dia por correo.
// Egress: sin clase JC-ON visible hoy = 0 lecturas. Con la clase visible (desde 1 h antes) se lee el roster (<= ~80 filas, cache 10 min);
// en ventana (30 min antes a 30 min despues) lectura INCREMENTAL de eventos + zoom_reuniones_activas + registro; cache de 30 s compartido,
// una lectura en vuelo y tiempo limite de 20 s. Los participantes en vivo de Zoom salen del MISMO cache de zoomEnVivo.ts (20 s): JC-ON no
// agrega llamadas a Zoom. En memoria solo hashes, como en leerVivo.ts.
const PAGINA = 1000;
const MAX_PAGINAS = 3;           // JC-ON: ~80 personas por clase; 3.000 eventos es un techo holgado
const MAX_SALAS = 8;
const SOLAPE_IDS = 25;
const MAX_INTENTOS_META = 3;
export const TTL_CACHE_VIVO_JCON_MS = 30_000;
export const TTL_ROSTER_JCON_MS = 10 * 60_000;
export const TTL_REGISTRO_MS = 5 * 60_000;
const LOTE_IDS = 100;
export const LIMITE_LECTURA_MS = 20_000;
const AVISO_REGISTRO = "No se pudo leer el registro de Zoom: quien entró con un correo distinto al del roster puede salir como desconocido.";

type SalaEstado = { uuid: string; host: string | null; topic: string | null; activo: boolean; actualizado: number | null; eventos: Map<number, EventoVivo>;
  metaOk: boolean; intentosMeta: number };
type Roster = { ms: number; identidad: IdentidadRosterVivo; n: Record<GrupoJcon, number> };
type Vivo = { dia: string; cursor: number; salas: Map<string, SalaEstado>; cargado: boolean; ultimoRefrescoMs: number };

let roster: Roster | null = null;
let vivo: Vivo | null = null;
let registro: { dia: string; ms: number; idx: Map<string, string | null> } | null = null;
let registroId: { dia: string; ms: number; idx: Map<string, string | null>; pendientes: Set<string> } | null = null;
let cache: { ms: number; data: VivoResponse } | null = null;
let enCurso: Promise<VivoResponse> | null = null;
let ultimaLecturaMs = 0;

function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export function vaciarCacheVivoJcon() { roster = null; vivo = null; registro = null; registroId = null; cache = null; enCurso = null; ultimaLecturaMs = 0; }

async function leerPaginado<T>(construir: () => any): Promise<{ filas: T[]; truncado: boolean }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filas: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await construir().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

// jcon.estudiantes (esquema jcon expuesto en PostgREST; la clave de servidor tiene SELECT). Se hashea al leer y las filas se descartan.
async function cargarRoster(ahoraMs: number): Promise<Roster> {
  const sb = supabaseServidor();
  const { filas } = await leerPaginado<EstudianteJcon>(() => sb.schema("jcon").from("estudiantes")
    .select("cedula,email,horario,estado").eq("cohorte_jcon", COHORTE_JCON).order("cedula", { ascending: true }));
  const r = rosterJcon(filas);
  return { ms: ahoraMs, identidad: indexarRosterVivo(r.filas), n: r.n };
}

async function cargarRegistro(dia: string): Promise<Map<string, string | null>> {
  const sb = supabaseServidor();
  const { filas } = await leerPaginado<{ correo_norm: string | null; cedula_digitos: string | null }>(() => sb.from("v_asist_registrantes_panel")
    .select("correo_norm,cedula_digitos").eq("fecha_sesion", dia).order("registrant_id", { ascending: true }));
  return indexarRegistroVivo(filas);
}

async function cargarRegistroPorId(dia: string, nuevos: Set<string>, ahoraMs: number): Promise<void> {
  if (!registroId || registroId.dia !== dia) registroId = { dia, ms: ahoraMs, idx: new Map(), pendientes: new Set() };
  const r = registroId;
  const vencido = ahoraMs - r.ms > TTL_REGISTRO_MS;
  const buscar = new Set([...nuevos].filter((id) => !r.idx.has(hashRegistrante(id)!)));
  if (vencido) { for (const id of r.pendientes) buscar.add(id); r.ms = ahoraMs; }
  if (!buscar.size) return;
  for (const id of buscar) r.pendientes.add(id);
  const sb = supabaseServidor();
  const ids = [...buscar];
  try {
    for (let i = 0; i < ids.length; i += LOTE_IDS) {
      const lote = ids.slice(i, i + LOTE_IDS);
      const { filas } = await leerPaginado<{ registrant_id: string | null; cedula_digitos: string | null }>(() => sb.from("zoom_registrantes")
        .select("registrant_id,cedula_digitos").in("registrant_id", lote).order("registrant_id", { ascending: true }));
      const idx = indexarRegistroIdVivo(filas);
      for (const id of lote) {
        const h = hashRegistrante(id)!;
        const hk = idx.get(h) ?? null;
        if (hk || !r.idx.get(h)) r.idx.set(h, hk);
        if (hk) r.pendientes.delete(id);
      }
    }
  } catch (e) { r.ms = 0; throw e; }
}

const salaVacia = (uuid: string): SalaEstado => ({ uuid, host: null, topic: null, activo: false, actualizado: null, eventos: new Map(), metaOk: false, intentosMeta: 0 });

async function refrescarVivo(dia: string, ahoraMs: number): Promise<{ truncado: boolean; registrantIds: Set<string> }> {
  const sb = supabaseServidor();
  if (!vivo || vivo.dia !== dia) vivo = { dia, cursor: 0, salas: new Map(), cargado: false, ultimoRefrescoMs: 0 };
  const v = vivo;
  const inicioDia = Date.parse(`${dia}T00:00:00Z`) + COT_MS;
  const { filas: activas } = await leerPaginado<{ uuid: string; host: string | null; topic: string | null; actualizado_en: string | null }>(() =>
    sb.from("zoom_reuniones_activas").select("uuid,host,topic,actualizado_en").eq("activo", true).order("uuid", { ascending: true }));
  const desdeId = Math.max(0, v.cursor - SOLAPE_IDS);
  const lectura = await leerPaginado<{ id: number; evento: string; correo: string | null; nombre: string | null; hora_ms: number; uuid: string | null; curso: string | null; registrant_id: string | null }>(() =>
    sb.from("v_asist_zoom_live_panel").select("id,evento,correo,nombre,hora_ms,uuid,curso,registrant_id")
      .in("evento", ["joined", "left"]).gt("id", desdeId).gte("hora_ms", inicioDia).ilike("curso", "%JCON%").order("id", { ascending: true }));
  let truncado = lectura.truncado;
  let cursorNuevo = v.cursor;
  const tope = (uuid: string) => v.salas.has(uuid) || v.salas.size < MAX_SALAS;
  const registrantIds = new Set<string>();
  for (const f of lectura.filas) {
    if (!f.uuid || !esClaseJcon(f.curso)) continue;
    if (!tope(f.uuid)) { truncado = true; continue; }
    let s = v.salas.get(f.uuid);
    if (!s) { s = salaVacia(f.uuid); s.topic = f.curso; v.salas.set(f.uuid, s); }
    s.eventos.set(Number(f.id), compactarEvento(f));
    if (f.registrant_id) registrantIds.add(String(f.registrant_id).trim());
    if (Number(f.id) > cursorNuevo) cursorNuevo = Number(f.id);
  }
  for (const a of activas) {
    if (!esClaseJcon(a.topic)) continue;
    if (!tope(a.uuid)) { truncado = true; continue; }
    const s = v.salas.get(a.uuid) ?? salaVacia(a.uuid);
    s.host = a.host; s.topic = a.topic ?? s.topic; s.actualizado = a.actualizado_en ? Date.parse(a.actualizado_en) : null; s.metaOk = true;
    v.salas.set(a.uuid, s);
  }
  const activasSet = new Set(activas.map((a) => a.uuid));
  for (const s of v.salas.values()) s.activo = activasSet.has(s.uuid) && (s.eventos.size > 0 || (s.actualizado != null && s.actualizado >= inicioDia));
  const sinMeta = [...v.salas.values()].filter((s) => !s.metaOk && s.intentosMeta < MAX_INTENTOS_META).slice(0, MAX_SALAS);
  if (sinMeta.length) {
    for (const s of sinMeta) s.intentosMeta += 1;
    try {
      const { filas: meta } = await leerPaginado<{ uuid: string; host: string | null; topic: string | null }>(() =>
        sb.from("zoom_reuniones_activas").select("uuid,host,topic").in("uuid", sinMeta.map((s) => s.uuid)).order("uuid", { ascending: true }));
      for (const m of meta) { const s = v.salas.get(m.uuid); if (s) { s.host = m.host; s.topic = m.topic ?? s.topic; s.metaOk = true; } }
    } catch { /* se reintenta en el siguiente refresco */ }
  }
  if (![...v.salas.values()].some((s) => !s.metaOk && s.intentosMeta < MAX_INTENTOS_META)) v.cursor = cursorNuevo;
  v.cargado = true; v.ultimoRefrescoMs = ahoraMs;
  return { truncado, registrantIds };
}

function salasDeMemoria(dia: string): SalaVivo[] {
  if (!vivo || vivo.dia !== dia) return [];
  return [...vivo.salas.values()].filter((s) => esClaseJcon(s.topic) && (s.eventos.size > 0 || s.activo))
    .map((s) => ({ uuid: s.uuid, host: s.host, topic: s.topic, activo: s.activo, eventos: [...s.eventos.values()] }));
}

async function calcular(ahoraMs: number): Promise<VivoResponse> {
  const dia = fechaCOT(ahoraMs);
  const lunes = lunesDe(dia);
  const respuesta = (franjas: FranjaVivo[], extra: Partial<Parameters<typeof armarRespuestaVivo>[0]> = {}) => armarRespuestaVivo({ semana: lunes, franjas,
    salas: salasDeMemoria(dia), rosterPorCorreo: conRegistro(roster?.identidad ?? indexarRosterVivo([]), registro?.dia === dia ? registro.idx : null,
      registroId?.dia === dia ? registroId.idx : null),
    ahoraMs, actualizadoMs: ultimaLecturaMs || ahoraMs, asociar: asociarSalaJcon, etiquetar: etiquetaJcon, programa: PROGRAMA_JCON, ...extra });
  // ¿Hay clase JC-ON visible hoy (desde 1 h antes hasta el fin del dia)? Si no, 0 lecturas.
  const hoySinRoster = franjasJcon(lunes).filter((f) => f.fecha === dia && estadoClase(f, ahoraMs) != null);
  if (!hoySinRoster.length) return respuesta([]);
  if (!roster || ahoraMs - roster.ms > TTL_ROSTER_JCON_MS) { roster = await cargarRoster(ahoraMs); ultimaLecturaMs = ahoraMs; }
  const hoy = franjasJcon(lunes, roster.n).filter((f) => f.fecha === dia);
  const hayVentana = hoy.some((f) => ventanaAbiertaAhora(f, ahoraMs));
  const cerroVentana = vivo?.dia === dia && vivo.cargado && hoy.some((f) => ahoraMs > ventanaClase(f).hastaMs && vivo!.ultimoRefrescoMs <= ventanaClase(f).hastaMs);
  let avisoGeneral: string | null = null;
  let presentesPorSala: Map<string, EventoVivo[]> | null = null;
  if (hayVentana || cerroVentana) {
    const zoomEnCurso = hayVentana ? presentesZoom(ahoraMs) : null; // nunca lanza; mismo cache que JC
    let avisoRegistro: string | null = null;
    if (!registro || registro.dia !== dia || ahoraMs - registro.ms > TTL_REGISTRO_MS) {
      try { registro = { dia, ms: ahoraMs, idx: await cargarRegistro(dia) }; } catch { avisoRegistro = AVISO_REGISTRO; }
    }
    const { truncado, registrantIds } = await refrescarVivo(dia, ahoraMs);
    try { await cargarRegistroPorId(dia, registrantIds, ahoraMs); } catch { avisoRegistro = avisoRegistro ?? AVISO_REGISTRO; }
    ultimaLecturaMs = ahoraMs;
    const zoom = zoomEnCurso ? await zoomEnCurso : null;
    if (zoom?.salas) presentesPorSala = new Map([...zoom.salas].map(([uuid, ps]) => [uuid, compactarPresentes(ps)]));
    const avisoZoom = zoom && (zoom.estado === "fallo" || zoom.estado === "limite") ? "Zoom no respondió: «ahora en sala» sale solo de los webhooks y puede contar de menos." : null;
    avisoGeneral = [truncado ? "Hay más salas o eventos de los que se leen; las cifras pueden estar incompletas." : null, avisoRegistro, avisoZoom].filter(Boolean).join(" ") || null;
  }
  return respuesta(hoy, { lecturaEventos: vivo?.dia === dia && vivo.cargado, avisoGeneral, presentesPorSala });
}

// La ruta ya paso exigirAcceso. Un fallo lanza (no se cachea); la ruta sigue con JC y pone aviso.
export async function leerVivoJcon(ahoraMs: number = Date.now()): Promise<VivoResponse> {
  if (cache && ahoraMs - cache.ms < TTL_CACHE_VIVO_JCON_MS && ahoraMs >= cache.ms) return { ...cache.data, hora_servidor: new Date(ahoraMs).toISOString() };
  if (enCurso) return enCurso;
  const p = conTiempoLimite(calcular(ahoraMs)).then((data) => { cache = { ms: ahoraMs, data }; return data; }).finally(() => { enCurso = null; });
  enCurso = p;
  return p;
}
