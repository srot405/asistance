import "server-only";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase, listarIngresosDesdeBase } from "../detalleCalculo.mjs";
import type { CeldaRow, EntradaRow, FranjaRow, IngresoNominal, RosterRow, SesionRow, TipoIngreso } from "../detalleCalculo.d.mts";
import { construirReporteSemana } from "../reporteSemana.mjs";
import type { ReporteSemana, ResumenSemana } from "../reporteSemana.d.mts";
import { DETALLE_DEMO_BASE } from "../detalle-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { AusenteNominal, DetalleSemanaResponse, FiltroDetalle } from "../types";
import { leerTiempoReporte } from "./leerTiempo";
import { supabaseServidor } from "./supabase";

// Una semana es "Detalle" (roster congelado real) si asist_semana_resumen la marca
// así. Se consulta en vivo: nada que editar a mano cada semana. NO se deduce de
// asist_roster porque las semanas "Solo semanal" (ago-sep) también tienen roster.
export async function semanaTieneDetalle(semana: string): Promise<boolean> {
  if (MODO_DEMO) return semana in DETALLE_DEMO_BASE;
  const { data, error } = await supabaseServidor().from("asist_semana_resumen")
    .select("semana").eq("semana", semana).eq("nivel", "Detalle").limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Nivel registrado de la semana en asist_semana_resumen; null si aun no hay fila (semana en
// curso / sin resumen). Lo usa el reporte, que se decide por roster congelado y no por el resumen.
export async function nivelSemana(semana: string): Promise<string | null> {
  if (MODO_DEMO) return semana in DETALLE_DEMO_BASE ? "Detalle" : null;
  const { data, error } = await supabaseServidor().from("asist_semana_resumen")
    .select("nivel").eq("semana", semana).limit(1);
  if (error) throw error;
  return (data?.[0] as { nivel?: string } | undefined)?.nivel ?? null;
}

// 2026-10-14: Tiempo y Presencia por PERSONA tambien existen en semanas «Solo semanal» cuyo roster fue RECONSTRUIDO (08-17…09-07): quien
// ingreso y su % de estancia son fiables, pero la clase a la que pertenecia cada persona es la asignacion ACTUAL (no la de entonces).
// Por eso esta compuerta acepta «Solo semanal» cuando hay celdas por persona, y avisa `reconstruida`; las separaciones que dependen de la clase
// (en su horario / colados, tablas y filtros por clase) NO se afirman en esas semanas. NO reemplaza a semanaTieneDetalle (Semana, calendario y
// Estadisticas siguen igual).
export async function semanaConPersonas(semana: string): Promise<{ ok: boolean; reconstruida: boolean }> {
  if (MODO_DEMO) return { ok: semana in DETALLE_DEMO_BASE, reconstruida: false };
  const nivel = await nivelSemana(semana);
  if (nivel !== "Detalle" && nivel !== "Solo semanal") return { ok: false, reconstruida: false };
  const cliente = supabaseServidor();
  const [celdas, semanas] = await Promise.all([
    cliente.from("asist_celda_semana").select("persona_id").eq("semana", semana).limit(1),
    cliente.from("asist_semanas").select("notas").eq("semana", semana).limit(1),
  ]);
  if (celdas.error) throw celdas.error;
  if (semanas.error) throw semanas.error;
  const notas = String((semanas.data?.[0] as { notas?: string | null } | undefined)?.notas ?? "");
  const hayCeldas = (celdas.data ?? []).length > 0;
  return { ok: nivel === "Detalle" || hayCeldas, reconstruida: nivel === "Solo semanal" || /reconstruid/i.test(notas) };
}

// Pagina de a 1000 (tope por defecto de PostgREST) con orden estable: sin esto, una
// semana con >1000 entradas se truncaba en silencio y generaba ausentes falsos.
const PAGINA = 1000;
async function tabla<T>(nombre: string, columnas: string, semana: string, orden: string[]): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabaseServidor().from(nombre).select(columnas).eq("semana", semana);
    for (const col of orden) consulta = consulta.order(col, { ascending: true });
    const { data, error } = await consulta.range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as T[];
    salida.push(...lote);
    if (lote.length < PAGINA) return salida;
  }
}

async function cargarBaseSupabase(semana: string) {
  const [roster, franjas, sesiones, entradas, celdas] = await Promise.all([
    // correo_norm: solo lo usa la pestaña Presencia (TOC-91, leerPresenciaClase.ts),
    // el resto de este módulo lo ignora.
    tabla<RosterRow>("asist_roster", "persona_id,nombre,ciudad,slot_id,correo_norm", semana, ["persona_id"]),
    // hora_inicio/hora_fin: idem, solo Presencia (lib/horarioFranja.mjs).
    tabla<FranjaRow>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto,hora_inicio,hora_fin", semana, ["slot_id"]),
    tabla<SesionRow>("asist_sesiones", "sesion_id,slot_id,fecha,entradas_totales,estado_captura", semana, ["sesion_id"]),
    tabla<EntradaRow>("asist_entradas", "persona_id,sesion_id", semana, ["persona_id", "sesion_id"]),
    tabla<CeldaRow>("asist_celda_semana", "persona_id,estado", semana, ["persona_id"]),
  ]);
  return construirBase(roster, franjas, sesiones, entradas, celdas);
}

function cargarBaseDemo(semana: string) {
  const fixture = DETALLE_DEMO_BASE[semana];
  if (!fixture) throw new Error(`Sin datos demo para ${semana}`);
  return construirBase(fixture.roster, fixture.franjas, fixture.sesiones, fixture.entradas, fixture.celdas);
}

// Exportada (TOC-91): leerPresenciaClase.ts reusa la MISMA carga de base
// (roster/franjas/sesiones/entradas/celdas + demo vs. real) en vez de
// reimplementarla — solo agrega la clasificación de presencia encima.
export async function cargarBase(semana: string) {
  return MODO_DEMO ? cargarBaseDemo(semana) : cargarBaseSupabase(semana);
}

export async function leerDetalleSemana(semana: string, filtro: FiltroDetalle = {}): Promise<DetalleSemanaResponse> {
  const base = await cargarBase(semana);
  return calcularDetalleSemana(semana, base, filtro);
}

export async function listarAusentesNominal(semana: string, opts: FiltroDetalle & { fecha?: string }): Promise<AusenteNominal[]> {
  const base = await cargarBase(semana);
  return listarAusentesDesdeBase(base, opts);
}

// Reporte CSV completo (TOC-91): sirve con semana incompleta. Devuelve null si la
// semana no tiene roster congelado (la ruta responde 404 claro, no 500).
export async function leerReporteSemana(semana: string): Promise<ReporteSemana | null> {
  if (MODO_DEMO && !(semana in DETALLE_DEMO_BASE)) return null;
  const base = await cargarBase(semana);
  if (base.roster.length === 0) return null;
  let resumen: ResumenSemana | null = null;
  if (!MODO_DEMO) {
    const { data, error } = await supabaseServidor().from("asist_semana_resumen")
      .select("nivel,captura_completa,poblacion,asistieron,nunca,cuadre").eq("semana", semana).limit(1);
    if (error) throw error;
    resumen = (data?.[0] as ResumenSemana | undefined) ?? null;
  }
  let congelacion: { congelada_en?: string | null; reconstruida?: boolean } | null = null;
  if (!MODO_DEMO) {
    const { data, error } = await supabaseServidor().from("asist_semanas")
      .select("congelada_en,notas").eq("semana", semana).limit(1);
    if (error) throw error;
    const fila = data?.[0] as { congelada_en?: string | null; notas?: string | null } | undefined;
    if (fila) congelacion = { congelada_en: fila.congelada_en, reconstruida: /reconstruid/i.test(fila.notas ?? "") };
  }
  // TOC-140: veredicto de tiempo por persona (MEJOR sesion). Sin tablas -> no_calculado; el reporte nunca falla por el tiempo.
  const tiempos = await leerTiempoReporte(semana).catch(() => null);
  return construirReporteSemana(semana, base, resumen, congelacion, tiempos);
}

// Filtros del calendario (TOC-91): nominal de horario / colados / ambos para el CSV. Misma base que el resto del detalle.
export async function listarIngresosNominal(semana: string, opts: FiltroDetalle & { fecha?: string; tipo: TipoIngreso }): Promise<IngresoNominal[]> {
  const base = await cargarBase(semana);
  return listarIngresosDesdeBase(base, opts);
}
