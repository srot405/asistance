import "server-only";
import { COT_MS, esClase, fechaCOT, ventanaAbiertaAhora, ventanaClase } from "../vivoCalculo.mjs";
import type { FranjaVivo } from "../vivoCalculo.d.mts";
import { armarListaVivo } from "../vivoNominal.mjs";
import type { EventoCrudo, FilaRegistrante, FilaRoster, ListaVivoResponse, SalaCruda } from "../vivoNominal.d.mts";
import { supabaseServidor } from "./supabase";

// TOC-153, pestana "Lista en vivo": lector NOMINAL (nombres, correos, cedulas). Solo lo llama /api/vivo-nominal despues de
// exigirAcceso + autorizarNominal. Va aparte de leerVivo.ts a proposito: aquel guarda solo hashes y no debe ganar PII.
// Egress: igual que En vivo, la lectura de zoom_live_log es INCREMENTAL (id > cursor) y solo con una clase en ventana; en frio
// se lee el dia una vez (tope 6.000 filas). Cache compartido 20 s + una lectura en vuelo; si una lectura falla se sirve el dato
// anterior (hasta 5 min) con aviso, y despues 503.
const PAGINA = 1000;
const MAX_PAGINAS = 6;
const SOLAPE_IDS = 25;
export const TTL_CACHE_LISTA_MS = 20_000;
export const MAX_DATO_VIEJO_MS = 5 * 60_000;
const TTL_BASE_MS = 10 * 60_000;     // franjas y roster: cambian una vez por semana
const TTL_REGISTRO_MS = 5 * 60_000;  // zoom_registrantes: el sync corre cada hora (:40)

type Base = { lunes: string; ms: number; franjas: FranjaVivo[] | null; roster: FilaRoster[] };
type Sala = { uuid: string; host: string | null; topic: string | null; activo: boolean; eventos: Map<number, EventoCrudo> };
type Dia = { dia: string; cursor: number; salas: Map<string, Sala>; cargado: boolean; ultimoMs: number };

let base: Base | null = null;
let registro: { dia: string; ms: number; filas: FilaRegistrante[] } | null = null;
let dia: Dia | null = null;
let cache: { ms: number; data: ListaVivoResponse } | null = null;
let enCurso: Promise<ListaVivoResponse> | null = null;

// Tiempo limite de una lectura compartida (sabado 2026-10-10): si una consulta a Supabase se cuelga (caida de red/DNS sin
// respuesta), la promesa en vuelo nunca terminaba y TODAS las lecturas siguientes la esperaban: la pantalla quedaba congelada
// hasta reiniciar el servidor. Con el limite, la lectura falla, se libera `enCurso` y la siguiente vuelve a leer.
export const LIMITE_LECTURA_MS = 20_000;
function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export function vaciarCacheListaVivo() { base = null; registro = null; dia = null; cache = null; enCurso = null; }

const lunesDe = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

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

async function cargarBase(lunes: string, ahoraMs: number): Promise<Base> {
  const sb = supabaseServidor();
  const { data: sem, error } = await sb.from("asist_semanas").select("semana").eq("semana", lunes).limit(1);
  if (error) throw error;
  if (!(sem ?? []).length) return { lunes, ms: ahoraMs, franjas: null, roster: [] };
  const franjas = (await leerPaginado<FranjaVivo>(() => sb.from("asist_franjas")
    .select("slot_id,dia,fecha,hora_inicio,hora_fin,tipo,cuenta_zoom,roster_n").eq("semana", lunes).order("slot_id", { ascending: true }))).filas;
  const roster = (await leerPaginado<FilaRoster>(() => sb.from("asist_roster")
    .select("persona_id,correo_norm,nombre,ciudad,slot_id").eq("semana", lunes).order("persona_id", { ascending: true }).order("slot_id", { ascending: true }))).filas;
  return { lunes, ms: ahoraMs, franjas, roster };
}

async function cargarRegistro(fecha: string): Promise<FilaRegistrante[]> {
  const sb = supabaseServidor();
  return (await leerPaginado<FilaRegistrante>(() => sb.from("zoom_registrantes")
    .select("correo_norm,cedula_digitos,nombre,apellido").eq("fecha_sesion", fecha).order("registrant_id", { ascending: true }))).filas;
}

async function refrescarEventos(fecha: string, ahoraMs: number): Promise<boolean> {
  const sb = supabaseServidor();
  if (!dia || dia.dia !== fecha) dia = { dia: fecha, cursor: 0, salas: new Map(), cargado: false, ultimoMs: 0 };
  const inicioDia = Date.parse(`${fecha}T00:00:00Z`) + COT_MS;
  const desdeId = Math.max(0, dia.cursor - SOLAPE_IDS);
  const { filas, truncado } = await leerPaginado<{ id: number; evento: "joined" | "left"; correo: string | null; nombre: string | null; hora_ms: number; uuid: string | null; curso: string | null }>(() =>
    sb.from("zoom_live_log").select("id,evento,correo,nombre,hora_ms,uuid,curso")
      .in("evento", ["joined", "left"]).gt("id", desdeId).gte("hora_ms", inicioDia)
      .or("curso.ilike.BACKEND*,curso.ilike.DESARROLLO*WEB*").order("id", { ascending: true }));
  let cursor = dia.cursor;
  for (const f of filas) {
    if (!f.uuid || !esClase(f.curso)) continue;
    let s = dia.salas.get(f.uuid);
    if (!s) { s = { uuid: f.uuid, host: null, topic: f.curso, activo: false, eventos: new Map() }; dia.salas.set(f.uuid, s); }
    s.eventos.set(Number(f.id), { id: Number(f.id), evento: f.evento, ms: Number(f.hora_ms), correo: f.correo, nombre: f.nombre });
    if (Number(f.id) > cursor) cursor = Number(f.id);
  }
  // host/topic/activo de las salas del dia (tabla pequena; el uuid identifica la sala)
  const uuids = [...dia.salas.keys()];
  if (uuids.length) {
    const { filas: meta } = await leerPaginado<{ uuid: string; host: string | null; topic: string | null; activo: boolean }>(() =>
      sb.from("zoom_reuniones_activas").select("uuid,host,topic,activo").in("uuid", uuids).order("uuid", { ascending: true }));
    for (const m of meta) { const s = dia.salas.get(m.uuid); if (s) { s.host = m.host; s.topic = m.topic ?? s.topic; s.activo = Boolean(m.activo); } }
  }
  dia.cursor = cursor; dia.cargado = true; dia.ultimoMs = ahoraMs;
  return truncado;
}

async function calcular(ahoraMs: number): Promise<ListaVivoResponse> {
  const fecha = fechaCOT(ahoraMs);
  const lunes = lunesDe(fecha);
  if (!base || base.lunes !== lunes || ahoraMs - base.ms > TTL_BASE_MS) base = await cargarBase(lunes, ahoraMs);
  const vacio = (aviso: string): ListaVivoResponse => ({ disponible: false, semana: lunes, hora_servidor: new Date(ahoraMs).toISOString(),
    actualizado_en: new Date(ahoraMs).toISOString(), clases: [], aviso_general: aviso });
  if (!base.franjas) return vacio("La semana actual todavía no está congelada: no hay clases para mostrar.");
  const hoy = base.franjas.filter((f) => f.fecha === fecha);
  if (!hoy.length) return vacio("Hoy no hay clases programadas.");
  const hayVentana = hoy.some((f) => ventanaAbiertaAhora(f, ahoraMs));
  const cerroVentana = dia?.dia === fecha && dia.cargado && hoy.some((f) => ahoraMs > ventanaClase(f).hastaMs && dia!.ultimoMs <= ventanaClase(f).hastaMs);
  const enFrio = !(dia?.dia === fecha && dia.cargado);
  let truncado = false;
  if (hayVentana || cerroVentana || enFrio) {
    if (!registro || registro.dia !== fecha || ahoraMs - registro.ms > TTL_REGISTRO_MS) registro = { dia: fecha, ms: ahoraMs, filas: await cargarRegistro(fecha) };
    truncado = await refrescarEventos(fecha, ahoraMs);
  }
  const salas: SalaCruda[] = dia && dia.dia === fecha
    ? [...dia.salas.values()].filter((s) => esClase(s.topic)).map((s) => ({ uuid: s.uuid, host: s.host, topic: s.topic, activo: s.activo, eventos: [...s.eventos.values()] }))
    : [];
  return armarListaVivo({ semana: lunes, franjasHoy: hoy, franjasSemana: base.franjas, salas, roster: base.roster, registrantes: registro?.filas ?? [],
    ahoraMs, actualizadoMs: dia?.ultimoMs || ahoraMs,
    avisoGeneral: truncado ? "Hay más eventos de los que se leen en una consulta; la lista puede estar incompleta." : null });
}

// El llamador ya paso exigirAcceso + autorizarNominal. Lanza solo si falla Y no hay dato reciente para servir.
export async function leerListaVivo(ahoraMs: number = Date.now()): Promise<ListaVivoResponse> {
  if (cache && ahoraMs - cache.ms < TTL_CACHE_LISTA_MS && ahoraMs >= cache.ms) return { ...cache.data, hora_servidor: new Date(ahoraMs).toISOString() };
  if (enCurso) return enCurso;
  const anterior = cache;
  const p = conTiempoLimite(calcular(ahoraMs))
    .then((data) => { cache = { ms: ahoraMs, data }; return data; })
    .catch((e) => {
      if (anterior && ahoraMs - anterior.ms <= MAX_DATO_VIEJO_MS) {
        const aviso = "No se pudo actualizar; se muestra la última lectura buena.";
        return { ...anterior.data, hora_servidor: new Date(ahoraMs).toISOString(),
          aviso_general: [anterior.data.aviso_general, aviso].filter(Boolean).join(" ") };
      }
      throw e;
    })
    .finally(() => { enCurso = null; });
  enCurso = p;
  return p;
}
