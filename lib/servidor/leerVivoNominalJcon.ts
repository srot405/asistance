import "server-only";
import { COT_MS, estadoClase, fechaCOT, ventanaAbiertaAhora, ventanaClase } from "../vivoCalculo.mjs";
import type { FranjaVivo } from "../vivoCalculo.d.mts";
import { armarListaVivo } from "../vivoNominal.mjs";
import type { EventoCrudo, FilaRegistrante, FilaRegistranteId, FilaRoster, ListaVivoResponse } from "../vivoNominal.d.mts";
import { asociarSalaJcon, COHORTE_JCON, esClaseJcon, etiquetaJcon, franjasJcon, lunesDe, PROGRAMA_JCON, rosterJcon } from "../vivoJcon.mjs";
import type { EstudianteJcon, GrupoJcon } from "../vivoJcon.d.mts";
import { supabaseServidor } from "./supabase";
import type { PresenteZoom } from "../zoomPresentes.d.mts";
import { presentesZoom } from "./zoomEnVivo";

// TOC-208: JC-ON en «Lista en vivo». Lector NOMINAL paralelo a leerVivoNominal.ts (JC), con estado propio: nunca mezcla personas,
// roster ni cache con JC. Solo lo llama /api/vivo-nominal despues de exigirAcceso + autorizarNominal; el recorte por permiso
// (recortarPorPermiso) se aplica a la respuesta combinada, igual que a JC (monitor: solo roster de su ciudad = jcon.estudiantes.grupo_ciudad).
// Egress: sin clase JC-ON visible hoy = 0 lecturas. Con clase visible: roster (cache 10 min), eventos INCREMENTALES (ilike %JCON%, cursor
// propio) en ventana, al cerrar la ventana y en frio; cache de 20 s, una lectura en vuelo, tiempo limite, dato viejo hasta 5 min con aviso.
const PAGINA = 1000;
const MAX_PAGINAS = 3;
const SOLAPE_IDS = 25;
export const TTL_CACHE_LISTA_JCON_MS = 20_000;
export const MAX_DATO_VIEJO_MS = 5 * 60_000;
const TTL_ROSTER_MS = 10 * 60_000;
const TTL_REGISTRO_MS = 5 * 60_000;
const LOTE_IDS = 100;
export const LIMITE_LECTURA_MS = 20_000;

type Sala = { uuid: string; host: string | null; topic: string | null; activo: boolean; eventos: Map<number, EventoCrudo> };
type Dia = { dia: string; cursor: number; salas: Map<string, Sala>; cargado: boolean; ultimoMs: number };

let roster: { ms: number; filas: FilaRoster[]; n: Record<GrupoJcon, number> } | null = null;
let registro: { dia: string; ms: number; filas: FilaRegistrante[] } | null = null;
let porId: { dia: string; ms: number; filas: Map<string, FilaRegistranteId | null> } | null = null;
let dia: Dia | null = null;
let cache: { ms: number; data: ListaVivoResponse } | null = null;
let enCurso: Promise<ListaVivoResponse> | null = null;

function conTiempoLimite<T>(p: Promise<T>, ms = LIMITE_LECTURA_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => { t = setTimeout(() => rechazar(new Error("lectura sin respuesta")), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export function vaciarCacheListaVivoJcon() { roster = null; registro = null; porId = null; dia = null; cache = null; enCurso = null; }

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

async function cargarRoster(ahoraMs: number) {
  const sb = supabaseServidor();
  const { filas } = await leerPaginado<EstudianteJcon>(() => sb.schema("jcon").from("estudiantes")
    .select("cedula,email,nombres,apellidos,horario,estado,grupo_ciudad").eq("cohorte_jcon", COHORTE_JCON).order("cedula", { ascending: true }));
  const r = rosterJcon(filas);
  return { ms: ahoraMs, filas: r.filas as FilaRoster[], n: r.n };
}

async function cargarRegistro(fecha: string): Promise<FilaRegistrante[]> {
  const sb = supabaseServidor();
  return (await leerPaginado<FilaRegistrante>(() => sb.from("v_asist_registrantes_panel")
    .select("correo_norm,cedula_digitos,nombre,apellido").eq("fecha_sesion", fecha).order("registrant_id", { ascending: true }))).filas;
}

async function cargarRegistroPorId(fecha: string, ahoraMs: number): Promise<void> {
  if (!porId || porId.dia !== fecha) porId = { dia: fecha, ms: ahoraMs, filas: new Map() };
  const vencido = ahoraMs - porId.ms > TTL_REGISTRO_MS;
  const ids = new Set<string>();
  for (const s of dia?.dia === fecha ? dia.salas.values() : []) for (const e of s.eventos.values()) if (e.registrant_id) ids.add(e.registrant_id);
  const faltan = [...ids].filter((id) => !porId!.filas.has(id) || (vencido && !porId!.filas.get(id)?.cedula_digitos));
  if (vencido) porId.ms = ahoraMs;
  if (!faltan.length) return;
  const sb = supabaseServidor();
  for (let i = 0; i < faltan.length; i += LOTE_IDS) {
    const lote = faltan.slice(i, i + LOTE_IDS);
    const filas = (await leerPaginado<FilaRegistranteId>(() => sb.from("zoom_registrantes")
      .select("registrant_id,correo_norm,cedula_digitos,nombre,apellido").in("registrant_id", lote).order("registrant_id", { ascending: true }))).filas;
    for (const id of lote) if (!porId.filas.get(id)?.cedula_digitos) porId.filas.set(id, null);
    for (const f of filas) porId.filas.set(f.registrant_id, f);
  }
}

async function refrescarEventos(fecha: string, ahoraMs: number): Promise<boolean> {
  const sb = supabaseServidor();
  if (!dia || dia.dia !== fecha) dia = { dia: fecha, cursor: 0, salas: new Map(), cargado: false, ultimoMs: 0 };
  const d = dia;
  const inicioDia = Date.parse(`${fecha}T00:00:00Z`) + COT_MS;
  const desdeId = Math.max(0, d.cursor - SOLAPE_IDS);
  const { filas, truncado } = await leerPaginado<{ id: number; evento: "joined" | "left"; correo: string | null; nombre: string | null; hora_ms: number; uuid: string | null; curso: string | null; registrant_id: string | null }>(() =>
    sb.from("v_asist_zoom_live_panel").select("id,evento,correo,nombre,hora_ms,uuid,curso,registrant_id")
      .in("evento", ["joined", "left"]).gt("id", desdeId).gte("hora_ms", inicioDia).ilike("curso", "%JCON%").order("id", { ascending: true }));
  let cursor = d.cursor;
  for (const f of filas) {
    if (!f.uuid || !esClaseJcon(f.curso)) continue;
    let s = d.salas.get(f.uuid);
    if (!s) { s = { uuid: f.uuid, host: null, topic: f.curso, activo: false, eventos: new Map() }; d.salas.set(f.uuid, s); }
    s.eventos.set(Number(f.id), { id: Number(f.id), evento: f.evento, ms: Number(f.hora_ms), correo: f.correo, nombre: f.nombre, registrant_id: f.registrant_id ?? null });
    if (Number(f.id) > cursor) cursor = Number(f.id);
  }
  const uuids = [...d.salas.keys()];
  if (uuids.length) {
    const { filas: meta } = await leerPaginado<{ uuid: string; host: string | null; topic: string | null; activo: boolean }>(() =>
      sb.from("zoom_reuniones_activas").select("uuid,host,topic,activo").in("uuid", uuids).order("uuid", { ascending: true }));
    for (const m of meta) { const s = d.salas.get(m.uuid); if (s) { s.host = m.host; s.topic = m.topic ?? s.topic; s.activo = Boolean(m.activo); } }
  }
  d.cursor = cursor; d.cargado = true; d.ultimoMs = ahoraMs;
  return truncado;
}

async function calcular(ahoraMs: number): Promise<ListaVivoResponse> {
  const fecha = fechaCOT(ahoraMs);
  const lunes = lunesDe(fecha);
  const comun = { semana: lunes, asociar: asociarSalaJcon, etiquetar: etiquetaJcon, programa: PROGRAMA_JCON };
  if (!franjasJcon(lunes).some((f) => f.fecha === fecha && estadoClase(f, ahoraMs) != null)) {
    return armarListaVivo({ ...comun, franjasHoy: [], salas: [], roster: [], registrantes: [], ahoraMs });
  }
  if (!roster || ahoraMs - roster.ms > TTL_ROSTER_MS) roster = await cargarRoster(ahoraMs);
  const semana: FranjaVivo[] = franjasJcon(lunes, roster.n);
  const hoy = semana.filter((f) => f.fecha === fecha);
  const hayVentana = hoy.some((f) => ventanaAbiertaAhora(f, ahoraMs));
  const cerroVentana = dia?.dia === fecha && dia.cargado && hoy.some((f) => ahoraMs > ventanaClase(f).hastaMs && dia!.ultimoMs <= ventanaClase(f).hastaMs);
  const enFrio = !(dia?.dia === fecha && dia.cargado);
  // En frio ANTES de la ventana (clase «proxima») no hay nada que leer todavia.
  const antesDeVentana = hoy.every((f) => ahoraMs < ventanaClase(f).desdeMs);
  let truncado = false;
  let presentesPorSala: Map<string, PresenteZoom[]> | null = null;
  let avisoZoom: string | null = null;
  let avisoRegistroId: string | null = null;
  if (hayVentana || cerroVentana || (enFrio && !antesDeVentana)) {
    const zoomEnCurso = hayVentana ? presentesZoom(ahoraMs) : null; // nunca lanza; mismo cache que JC
    if (!registro || registro.dia !== fecha || ahoraMs - registro.ms > TTL_REGISTRO_MS) registro = { dia: fecha, ms: ahoraMs, filas: await cargarRegistro(fecha) };
    truncado = await refrescarEventos(fecha, ahoraMs);
    const zoom = zoomEnCurso ? await zoomEnCurso : null;
    presentesPorSala = zoom?.salas ?? null;
    if (zoom && (zoom.estado === "fallo" || zoom.estado === "limite")) avisoZoom = "Zoom no respondió: «ahora en sala» sale solo de los webhooks y puede contar de menos.";
    try { await cargarRegistroPorId(fecha, ahoraMs); }
    catch { avisoRegistroId = "No se pudo leer el registro de Zoom por ID: alguien puede salir como no identificado."; }
  }
  const salas = dia && dia.dia === fecha
    ? [...dia.salas.values()].filter((s) => esClaseJcon(s.topic)).map((s) => ({ uuid: s.uuid, host: s.host, topic: s.topic, activo: s.activo, eventos: [...s.eventos.values()] }))
    : [];
  return armarListaVivo({ ...comun, franjasHoy: hoy, franjasSemana: semana, salas, roster: roster.filas, registrantes: registro?.dia === fecha ? registro.filas : [],
    registrantesPorId: porId?.dia === fecha ? [...porId.filas.values()].filter((f): f is FilaRegistranteId => f != null) : [], ahoraMs, actualizadoMs: dia?.ultimoMs || ahoraMs,
    avisoGeneral: [truncado ? "Hay más eventos de los que se leen en una consulta; la lista puede estar incompleta." : null, avisoRegistroId, avisoZoom].filter(Boolean).join(" ") || null,
    presentesPorSala });
}

// Lanza solo si falla Y no hay dato reciente para servir (la ruta sigue con JC y pone aviso).
export async function leerListaVivoJcon(ahoraMs: number = Date.now()): Promise<ListaVivoResponse> {
  if (cache && ahoraMs - cache.ms < TTL_CACHE_LISTA_JCON_MS && ahoraMs >= cache.ms) return { ...cache.data, hora_servidor: new Date(ahoraMs).toISOString() };
  if (enCurso) return enCurso;
  const anterior = cache;
  const p = conTiempoLimite(calcular(ahoraMs))
    .then((data) => { cache = { ms: ahoraMs, data }; return data; })
    .catch((e) => {
      if (anterior && ahoraMs - anterior.ms <= MAX_DATO_VIEJO_MS && anterior.data.clases.length) {
        return { ...anterior.data, hora_servidor: new Date(ahoraMs).toISOString(),
          aviso_general: [anterior.data.aviso_general, "No se pudo actualizar; se muestra la última lectura buena."].filter(Boolean).join(" ") };
      }
      throw e;
    })
    .finally(() => { enCurso = null; });
  enCurso = p;
  return p;
}
