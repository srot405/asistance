import "server-only";
import { armarRespuestaVivo, compactarEvento, esClase, fechaCOT, hashCorreo, ventanaAbiertaAhora, COT_MS } from "../vivoCalculo.mjs";
import type { EventoVivo, FranjaVivo, SalaVivo, VivoResponse } from "../vivoCalculo.d.mts";
import { supabaseServidor } from "./supabase";

// TOC-142, pestana "En vivo": UNICO punto de acople con Supabase. Devuelve solo CONTEOS (ver lib/vivoCalculo.mjs).
// Egress (Supabase ya ~2,9/5 GB):
//  - Sin clase en ventana: 0 lecturas de zoom_live_log (solo la franja del dia, cache largo).
//  - En ventana de clase: lectura INCREMENTAL (id > ultimo leido, con un pequeno solape y dedupe por id) + zoom_reuniones_activas
//    (activo=true, pocas filas). Resultado cacheado TTL_CACHE_VIVO_MS compartido por todos los visitantes.
//  - El estado en memoria guarda hashes de correo/nombre, nunca el texto. Un fallo no se cachea (el llamador responde 503).
const PAGINA = 1000;
const MAX_PAGINAS = 6;           // tope de filas por lectura incremental (6.000)
const MAX_SALAS = 24;            // tope de salas de clase rastreadas por dia
const SOLAPE_IDS = 25;           // el webhook puede confirmar ids fuera de orden: se relee un poco hacia atras
export const TTL_CACHE_VIVO_MS = 20_000;
export const TTL_BASE_MS = 10 * 60_000; // franjas del dia y roster: cambian una vez por semana

type FilaFranja = FranjaVivo;
type SalaEstado = { uuid: string; host: string | null; topic: string | null; activo: boolean; actualizado: number | null; eventos: Map<number, EventoVivo> };
type Base = { lunes: string; cargadoMs: number; franjas: FilaFranja[] | null; roster: Set<string> | null; rosterMs: number };
type Vivo = { dia: string; cursor: number; salas: Map<string, SalaEstado> };

let base: Base | null = null;
let vivo: Vivo | null = null;
let cache: { ms: number; data: VivoResponse } | null = null;
let enCurso: Promise<VivoResponse> | null = null;

export function vaciarCacheVivo() { base = null; vivo = null; cache = null; enCurso = null; }

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

async function cargarRoster(lunes: string): Promise<Set<string>> {
  const sb = supabaseServidor();
  const filas = await leerPaginado<{ correo_norm: string | null }>(() => sb.from("asist_roster")
    .select("correo_norm").eq("semana", lunes).order("persona_id", { ascending: true }));
  const set = new Set<string>();
  for (const f of filas) { const h = hashCorreo(f.correo_norm); if (h) set.add(h); }
  return set;
}

function salaVacia(uuid: string): SalaEstado { return { uuid, host: null, topic: null, activo: false, actualizado: null, eventos: new Map() }; }

async function refrescarVivo(dia: string): Promise<{ truncado: boolean }> {
  const sb = supabaseServidor();
  if (!vivo || vivo.dia !== dia) vivo = { dia, cursor: 0, salas: new Map() };
  const inicioDia = Date.parse(`${dia}T00:00:00Z`) + COT_MS;
  // 1) salas activas ahora (tabla pequena)
  const activas = await leerPaginado<{ uuid: string; host: string | null; topic: string | null; actualizado_en: string | null }>(() =>
    sb.from("zoom_reuniones_activas").select("uuid,host,topic,actualizado_en").eq("activo", true).order("uuid", { ascending: true }));
  // 2) eventos nuevos (solo de clases), incremental
  const desdeId = Math.max(0, vivo.cursor - SOLAPE_IDS);
  const filas = await leerPaginado<{ id: number; evento: string; correo: string | null; nombre: string | null; hora_ms: number; uuid: string | null; curso: string | null }>(() =>
    sb.from("zoom_live_log").select("id,evento,correo,nombre,hora_ms,uuid,curso")
      .in("evento", ["joined", "left"]).gt("id", desdeId).gte("hora_ms", inicioDia)
      .or("curso.ilike.BACKEND*,curso.ilike.DESARROLLO*WEB*").order("id", { ascending: true }));
  let truncado = filas.length >= MAX_PAGINAS * PAGINA;
  const nuevos = new Set<string>();
  const tope = (uuid: string) => vivo!.salas.has(uuid) || vivo!.salas.size < MAX_SALAS;
  for (const f of filas) {
    if (!f.uuid || !esClase(f.curso)) continue;
    if (!tope(f.uuid)) { truncado = true; continue; }
    let s = vivo.salas.get(f.uuid);
    if (!s) { s = salaVacia(f.uuid); s.topic = f.curso; vivo.salas.set(f.uuid, s); nuevos.add(f.uuid); }
    s.eventos.set(Number(f.id), compactarEvento(f));
    if (Number(f.id) > vivo.cursor) vivo.cursor = Number(f.id);
  }
  // 3) metadatos (host/topic) de salas nuevas que no estan entre las activas
  for (const a of activas) {
    if (!esClase(a.topic)) continue;
    if (!tope(a.uuid)) { truncado = true; continue; }
    const s = vivo.salas.get(a.uuid) ?? salaVacia(a.uuid);
    s.host = a.host; s.topic = a.topic ?? s.topic; s.actualizado = a.actualizado_en ? Date.parse(a.actualizado_en) : null;
    vivo.salas.set(a.uuid, s);
  }
  const activasSet = new Set(activas.map((a) => a.uuid));
  for (const s of vivo.salas.values()) s.activo = activasSet.has(s.uuid) && (s.eventos.size > 0 || (s.actualizado != null && s.actualizado >= inicioDia));
  const sinMeta = [...nuevos].filter((u) => !activasSet.has(u));
  if (sinMeta.length) {
    const filasMeta = await leerPaginado<{ uuid: string; host: string | null; topic: string | null }>(() =>
      sb.from("zoom_reuniones_activas").select("uuid,host,topic").in("uuid", sinMeta).order("uuid", { ascending: true }));
    for (const m of filasMeta) { const s = vivo.salas.get(m.uuid); if (s) { s.host = m.host; s.topic = m.topic ?? s.topic; } }
  }
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
  }
  const vacio = (aviso: string): VivoResponse => ({ disponible: false, actualizado_en: new Date(ahoraMs).toISOString(), semana: lunes,
    hora_servidor: new Date(ahoraMs).toISOString(), clases: [], aviso_general: aviso });
  if (!base.franjas) return vacio("La semana actual todavía no está congelada: no hay clases para mostrar.");
  const franjas = base.franjas;
  const hoy = franjas.filter((f) => f.fecha === dia);
  const hayVentana = hoy.some((f) => ventanaAbiertaAhora(f, ahoraMs));
  let avisoGeneral: string | null = null;
  if (hayVentana) {
    if (!base.roster || ahoraMs - base.rosterMs > TTL_BASE_MS) { base.roster = await cargarRoster(lunes); base.rosterMs = ahoraMs; }
    const { truncado } = await refrescarVivo(dia);
    if (truncado) avisoGeneral = "Hay más salas o eventos de los que se leen; las cifras pueden estar incompletas.";
  }
  return armarRespuestaVivo({ semana: lunes, franjas: hoy, salas: salasDeMemoria(dia), rosterPorCorreo: base.roster ?? new Set<string>(),
    ahoraMs, actualizadoMs: ahoraMs, lecturaEventos: hayVentana, avisoGeneral });
}

// El llamador (ruta) ya paso exigirAcceso. Un fallo lanza (no se cachea).
export async function leerVivo(ahoraMs: number = Date.now()): Promise<VivoResponse> {
  if (cache && ahoraMs - cache.ms < TTL_CACHE_VIVO_MS && ahoraMs >= cache.ms) return cache.data;
  if (enCurso) return enCurso;
  const p = calcular(ahoraMs).then((data) => { cache = { ms: ahoraMs, data }; return data; }).finally(() => { enCurso = null; });
  enCurso = p;
  return p;
}
