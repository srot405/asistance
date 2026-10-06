import "server-only";
import { MODO_DEMO } from "../demo.js";
import { TIEMPO_DEMO, TIEMPO_DEMO_SERIE } from "../tiempo-demo.mjs";
import { armarSerieTiempo, armarTiempoSemana, normalizarResumenPersonas } from "../tiempoCalculo.mjs";
import type { FilaClaseBackend, FilaCsvTiempo, FilaTiempoPersona, FiltroTiempo, FranjaTiempo, ResumenPersonasTiempo,
  TiempoNoDisponible, TiempoSemanaResponse, TiempoSerieResponse } from "../tiempoContrato.d.mts";
import { supabaseServidor } from "./supabase";

// UNICO punto de acople con el backend de tiempo (objetos 082/083). Lee SOLO asist_tiempo_clase,
// v_asist_tiempo_persona, v_asist_tiempo_semana, asist_tiempo_persona_semana y asist_semana_resumen.tiempo_*;
// nunca asist_tiempos (081) y nunca recalcula veredictos. La respuesta de /api/tiempo y /api/tiempo-semanas
// son solo agregados: nombre/persona_id/correo viven unicamente en el CSV autenticado (listarTiempoNominal).

const PAGINA = 1000;
export const NO_DISPONIBLE: TiempoNoDisponible = { disponible: false, motivo: "sin_tablas" };

// PGRST205 (tabla/vista fuera del cache de PostgREST), 42P01 (undefined_table) o su mensaje.
export function esTablaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST205" || e.code === "42P01" || /could not find the table|does not exist|schema cache/i.test(e.message ?? "");
}

// Pagina de a 1000 con orden estable (un lote < 1000 corta). Mismo patron que leerDetalleSemana.ts::tabla.
export async function tablaTiempo<T>(nombre: string, columnas: string, semana: string | null, orden: string[]): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabaseServidor().from(nombre).select(columnas);
    if (semana) consulta = consulta.eq("semana", semana);
    for (const col of orden) consulta = consulta.order(col, { ascending: true });
    const { data, error } = await consulta.range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as T[];
    salida.push(...lote);
    if (lote.length < PAGINA) return salida;
  }
}

const COLUMNAS_CLASE = "sesion_id,slot_id,fecha,estado_captura,roster_n,ingresaron_propios,visitas,visitas_cumplen,visitas_rojo," +
  "visitas_sin_dato,n_medibles,n_cumplen,n_rojo,n_sin_dato,n_pendiente,n_parciales,n_no_medibles,mediana_pct,p10_pct,p90_pct," +
  "hist,cobertura,fin_clase_min,fin_confiable,clase_evaluable,motivo_no_evaluable,umbral_pct";
// SIN nombre ni persona_id: solo lo necesario para agregar.
const COLUMNAS_PERSONA = "sesion_id,franja_tiempo,fecha,es_visita,franja_propia,ciudad,estado_tiempo,cumple_50,motivo,pct_tiempo,segundos";
const COLUMNAS_RESUMEN = "tiempo_umbral_pct,tiempo_roster,tiempo_cumplen,tiempo_rojo,tiempo_sin_dato,tiempo_ausentes,tiempo_sin_clase," +
  "tiempo_pendientes,tiempo_con_entrada,tiempo_medidos,tiempo_cobertura,tiempo_definitivo";

type FilaPersonaDb = Omit<FilaTiempoPersona, "slot_id" | "fecha"> & { franja_tiempo: string | null; fecha: string | null };

function aFilaPersona(f: FilaPersonaDb): FilaTiempoPersona {
  return { ...f, slot_id: f.franja_tiempo ?? f.sesion_id.split("|")[1] ?? "", fecha: f.fecha ?? f.sesion_id.split("|")[0] ?? "",
    pct_tiempo: f.pct_tiempo == null ? null : Number(f.pct_tiempo), segundos: f.segundos == null ? null : Number(f.segundos) };
}

async function unaFila<T>(tabla: string, columnas: string, semana: string): Promise<T | null> {
  const { data, error } = await supabaseServidor().from(tabla).select(columnas).eq("semana", semana).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as unknown as T | undefined) ?? null;
}

type FilaSemanaDb = { congelada_en: string | null; cerrada_en: string | null; estado: string; notas: string | null };

type BaseSemana = {
  clases: FilaClaseBackend[]; filasPersona: FilaPersonaDb[]; franjas: FranjaTiempo[]; fila: FilaSemanaDb | null;
  resumen: Record<string, unknown> | null;
};

// Cache de servidor por semana (TTL corto): guarda SOLO las filas crudas SIN nombre/persona_id/correo y no depende del
// usuario (el acceso ya se exigio en la ruta antes de llegar aqui), asi que no mezcla permisos. Cambiar un filtro
// (ciudad/clase/cuenta) se resuelve en memoria sobre la misma lectura en vez de releer v_asist_tiempo_persona (egress).
export const TTL_CACHE_TIEMPO_MS = 60_000;
const MAX_ENTRADAS_CACHE = 6;
const cacheBase = new Map<string, { en: number; lectura: Promise<BaseSemana> }>();
export function vaciarCacheTiempo(): void { cacheBase.clear(); }

async function leerBaseSemana(semana: string, conPersonas: boolean): Promise<BaseSemana> {
  const ahora = Date.now();
  // Una lectura completa (con personas) tambien sirve a quien pide solo la ligera.
  for (const clave of conPersonas ? [`${semana}|1`] : [`${semana}|1`, `${semana}|0`]) {
    const hit = cacheBase.get(clave);
    if (hit && ahora - hit.en < TTL_CACHE_TIEMPO_MS) return hit.lectura;
  }
  const clave = `${semana}|${conPersonas ? 1 : 0}`;
  const lectura = (async (): Promise<BaseSemana> => {
    const clases = await tablaTiempo<FilaClaseBackend>("asist_tiempo_clase", COLUMNAS_CLASE, semana, ["sesion_id"]);
    const [filasPersona, franjas, fila, resumen] = await Promise.all([
      conPersonas && clases.length ? tablaTiempo<FilaPersonaDb>("v_asist_tiempo_persona", COLUMNAS_PERSONA, semana, ["sesion_id", "persona_id"]) : Promise.resolve([]),
      tablaTiempo<FranjaTiempo>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto", semana, ["slot_id"]),
      unaFila<FilaSemanaDb>("asist_semanas", "congelada_en,cerrada_en,estado,notas", semana),
      unaFila<Record<string, unknown>>("asist_semana_resumen", COLUMNAS_RESUMEN, semana),
    ]);
    return { clases, filasPersona, franjas, fila, resumen };
  })();
  cacheBase.set(clave, { en: ahora, lectura });
  lectura.catch(() => { if (cacheBase.get(clave)?.lectura === lectura) cacheBase.delete(clave); });
  while (cacheBase.size > MAX_ENTRADAS_CACHE) cacheBase.delete(cacheBase.keys().next().value as string);
  return lectura;
}

// `ligero`: SOLO lo que necesita la tarjeta de la pestana Semana (conteos de asist_tiempo_clase); no lee la vista por persona.
export async function leerTiempoSemana(semana: string, filtro: FiltroTiempo = {}, opciones: { ligero?: boolean } = {}):
  Promise<TiempoSemanaResponse | TiempoNoDisponible> {
  if (MODO_DEMO) {
    const d = (TIEMPO_DEMO as Record<string, any>)[semana];
    if (!d) throw new Error(`Sin datos demo de tiempo para ${semana}`);
    return armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, filtro,
      info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila) } });
  }
  try {
    const ligero = Boolean(opciones.ligero);
    const { clases, filasPersona, franjas, fila, resumen } = await leerBaseSemana(semana, !ligero);
    const resumenPersonas: ResumenPersonasTiempo | null = normalizarResumenPersonas(resumen);
    const respuesta = armarTiempoSemana({ clases, personas: filasPersona.map(aFilaPersona), franjas, filtro: ligero ? {} : filtro, info: {
      semana, roster: resumenPersonas?.roster ?? null, congelada_en: fila?.congelada_en ?? null,
      reconstruida: /reconstruid/i.test(fila?.notas ?? ""), provisional: fila?.estado !== "cerrada", cerrada_en: fila?.cerrada_en ?? null,
      umbral_pct: resumenPersonas?.umbral_pct ?? null, resumen_personas: resumenPersonas } });
    // Sin la vista por persona no hay con que comparar: no se afirma una discrepancia que no existe.
    return ligero ? { ...respuesta, cuadre_backend: { estado: "SIN_COMPARAR", detalle: [] } } : respuesta;
  } catch (error) {
    if (esTablaAusente(error)) return NO_DISPONIBLE;
    throw error;
  }
}

const COLUMNAS_SERIE = "semana,clases,clases_evaluables,roster_franjas,n_ingresaron,n_medibles,n_cumplen,n_rojo,n_sin_dato,n_pendiente," +
  "estado_semana,congelada_en,cerrada_en,provisional,tiempo_roster";

export async function leerTiempoSemanas(): Promise<TiempoSerieResponse> {
  if (MODO_DEMO) return { disponible: true, semanas: armarSerieTiempo(TIEMPO_DEMO_SERIE as Record<string, unknown>[]) };
  try {
    const filas = await tablaTiempo<Record<string, unknown>>("v_asist_tiempo_semana", COLUMNAS_SERIE, null, ["semana"]);
    return { disponible: true, semanas: armarSerieTiempo(filas) };
  } catch (error) {
    if (esTablaAusente(error)) return NO_DISPONIBLE;
    throw error;
  }
}

// ---- CSV nominal (PII) ---------------------------------------------------------------------------------------
type RosterDb = { persona_id: string; nombre: string; ciudad: string; slot_id: string | null };
type PersonaNominalDb = FilaPersonaDb & { persona_id: string; nombre: string; minutos: number | null };
type SemanaPersonaDb = { persona_id: string; estado_tiempo: string; motivo: string | null; definitivo: boolean };

const sinFiltrar = (f: RosterDb | { ciudad: string; franja: string }, filtro: FiltroTiempo, cuentaDe: Map<string, string>) => {
  const franja = "slot_id" in f ? f.slot_id ?? "" : f.franja;
  return (!filtro.ciudad || f.ciudad === filtro.ciudad) && (!filtro.franja || franja === filtro.franja)
    && (!filtro.cuenta || cuentaDe.get(franja) === filtro.cuenta);
};

// Una fila por persona-sesion (propias y visitas). Quien no ingreso sale `no_ingreso`; sin tablas, `no_calculado`.
export async function listarTiempoNominal(semana: string, filtro: FiltroTiempo = {}): Promise<FilaCsvTiempo[]> {
  const sinCalcular = (roster: RosterDb[], fechaDe: Map<string, string>): FilaCsvTiempo[] => roster.map((p) => ({
    nombre: p.nombre, ciudad: p.ciudad, franja: p.slot_id ?? "", franja_tiempo: "", es_visita: false,
    fecha: fechaDe.get(p.slot_id ?? "") ?? "", pct_tiempo: null, estado_tiempo: "no_calculado", cumple_50: null, minutos: null,
    motivo_sin_dato: null, definitivo: null }));
  if (MODO_DEMO) {
    const d = (TIEMPO_DEMO as Record<string, any>)[semana];
    if (!d) return [];
    const cuentaDe = new Map<string, string>(d.franjas.map((f: FranjaTiempo) => [f.slot_id, f.cuenta_zoom]));
    const filas: FilaCsvTiempo[] = d.personas.filter((p: any) => sinFiltrar({ ciudad: p.ciudad, franja: p.franja_propia ?? "" }, filtro, cuentaDe))
      .map((p: any) => ({ nombre: p.nombre, ciudad: p.ciudad, franja: p.franja_propia ?? "", franja_tiempo: p.slot_id, es_visita: p.es_visita,
        fecha: p.fecha, pct_tiempo: p.pct_tiempo, estado_tiempo: p.estado_tiempo, cumple_50: p.cumple_50,
        minutos: p.segundos == null ? null : Math.round(p.segundos / 6) / 10, motivo_sin_dato: p.motivo,
        definitivo: p.estado_tiempo === "cumple" || !d.info.provisional }));
    return filas;
  }
  const [roster, franjas, fila] = await Promise.all([
    tablaTiempo<RosterDb>("asist_roster", "persona_id,nombre,ciudad,slot_id", semana, ["persona_id"]),
    tablaTiempo<FranjaTiempo>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto", semana, ["slot_id"]),
    unaFila<FilaSemanaDb>("asist_semanas", "congelada_en,cerrada_en,estado,notas", semana),
  ]);
  const cuentaDe = new Map(franjas.map((f) => [f.slot_id, f.cuenta_zoom]));
  const fechaDe = new Map(franjas.map((f) => [f.slot_id, f.fecha]));
  const cerrada = fila?.estado === "cerrada";
  const rosterFiltrado = roster.filter((p) => sinFiltrar(p, filtro, cuentaDe));
  let semanales: SemanaPersonaDb[];
  let sesiones: PersonaNominalDb[];
  try {
    semanales = await tablaTiempo<SemanaPersonaDb>("asist_tiempo_persona_semana", "persona_id,estado_tiempo,motivo,definitivo", semana, ["persona_id"]);
    sesiones = semanales.length ? await tablaTiempo<PersonaNominalDb>("v_asist_tiempo_persona",
      "sesion_id,franja_tiempo,fecha,persona_id,nombre,ciudad,es_visita,franja_propia,estado_tiempo,cumple_50,motivo,pct_tiempo,segundos,minutos",
      semana, ["sesion_id", "persona_id"]) : [];
  } catch (error) {
    if (esTablaAusente(error)) return sinCalcular(rosterFiltrado, fechaDe);
    throw error;
  }
  if (semanales.length === 0) return sinCalcular(rosterFiltrado, fechaDe);

  const conSesion = new Set(sesiones.map((s) => s.persona_id));
  const salida: FilaCsvTiempo[] = sesiones
    .filter((s) => sinFiltrar({ ciudad: s.ciudad ?? "", franja: s.franja_propia ?? "" }, filtro, cuentaDe))
    .map((s) => {
      const f = aFilaPersona(s);
      return { nombre: s.nombre, ciudad: s.ciudad ?? "", franja: s.franja_propia ?? "", franja_tiempo: f.slot_id, es_visita: s.es_visita,
        fecha: f.fecha, pct_tiempo: f.pct_tiempo, estado_tiempo: s.estado_tiempo, cumple_50: s.cumple_50,
        minutos: s.minutos == null ? (f.segundos == null ? null : Math.round(f.segundos / 6) / 10) : Number(s.minutos),
        motivo_sin_dato: s.motivo, definitivo: s.estado_tiempo === "cumple" ? true : cerrada };
    });
  const semanalDe = new Map(semanales.map((s) => [s.persona_id, s]));
  for (const p of rosterFiltrado) {
    if (conSesion.has(p.persona_id)) continue;
    const s = semanalDe.get(p.persona_id);
    if (!s) continue;
    const estado = s.estado_tiempo === "ausente" ? "no_ingreso" : s.estado_tiempo === "sin_clase" ? "no_calculado" : s.estado_tiempo;
    if (estado !== "no_ingreso" && estado !== "no_calculado" && estado !== "sin_dato_tiempo" && estado !== "pendiente") continue;
    salida.push({ nombre: p.nombre, ciudad: p.ciudad, franja: p.slot_id ?? "", franja_tiempo: "", es_visita: false,
      fecha: fechaDe.get(p.slot_id ?? "") ?? "", pct_tiempo: null, estado_tiempo: estado, cumple_50: null, minutos: null,
      motivo_sin_dato: s.estado_tiempo === "sin_clase" ? "sesion_sin_clase" : s.motivo, definitivo: estado === "no_ingreso" ? cerrada : s.definitivo });
  }
  return salida;
}

// ---- Reporte semanal (veredicto = MEJOR sesion) y CSV de presencia -----------------------------------------
export type TiempoReporte = {
  disponible: boolean;
  personas: Map<string, { estado_tiempo: string; cumple_50: boolean | null; motivo: string | null; mejor_pct: number | null;
    minutos_max: number | null; sesiones_consideradas: number; definitivo: boolean }>;
  resumen: ResumenPersonasTiempo | null;
};

export async function leerTiempoReporte(semana: string): Promise<TiempoReporte> {
  if (MODO_DEMO) {
    const d = (TIEMPO_DEMO as Record<string, any>)[semana];
    if (!d) return { disponible: false, personas: new Map(), resumen: null };
    return { disponible: true, personas: new Map(d.semanalPorPersona), resumen: normalizarResumenPersonas(d.resumenFila) };
  }
  try {
    const filas = await tablaTiempo<{ persona_id: string; estado_tiempo: string; cumple_50: boolean | null; motivo: string | null;
      mejor_pct: number | null; minutos_max: number | null; sesiones_consideradas: number; definitivo: boolean }>(
      "asist_tiempo_persona_semana", "persona_id,estado_tiempo,cumple_50,motivo,mejor_pct,minutos_max,sesiones_consideradas,definitivo",
      semana, ["persona_id"]);
    const resumen = normalizarResumenPersonas(await unaFila<Record<string, unknown>>("asist_semana_resumen", COLUMNAS_RESUMEN, semana));
    if (filas.length === 0) return { disponible: false, personas: new Map(), resumen: null };
    return { disponible: true, personas: new Map(filas.map((f) => [f.persona_id, { ...f,
      mejor_pct: f.mejor_pct == null ? null : Number(f.mejor_pct) }])), resumen };
  } catch (error) {
    if (esTablaAusente(error)) return { disponible: false, personas: new Map(), resumen: null };
    throw error;
  }
}

export type TiempoPresencia = { estado_tiempo: string; pct_tiempo: number | null; cumple_50: boolean | null };

// CSV de presencia: tiempo de las personas PROPIAS de una clase. Cualquier fallo -> mapa vacio (la presencia no depende del tiempo).
export async function leerTiempoPersonasClase(semana: string, slotId: string): Promise<Map<string, TiempoPresencia>> {
  if (MODO_DEMO) return new Map();
  try {
    const salida = new Map<string, TiempoPresencia>();
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabaseServidor().from("v_asist_tiempo_persona")
        .select("persona_id,estado_tiempo,pct_tiempo,cumple_50").eq("semana", semana).eq("franja_tiempo", slotId).eq("es_visita", false)
        .order("persona_id", { ascending: true }).range(desde, desde + PAGINA - 1);
      if (error) throw error;
      const lote = (data ?? []) as unknown as (TiempoPresencia & { persona_id: string })[];
      for (const f of lote) salida.set(f.persona_id, { estado_tiempo: f.estado_tiempo, cumple_50: f.cumple_50,
        pct_tiempo: f.pct_tiempo == null ? null : Number(f.pct_tiempo) });
      if (lote.length < PAGINA) return salida;
    }
  } catch {
    return new Map();
  }
}
