import "server-only";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase } from "../detalleCalculo.mjs";
import type { CeldaRow, EntradaRow, FranjaRow, RosterRow, SesionRow } from "../detalleCalculo.d.mts";
import { construirReporteSemana } from "../reporteSemana.mjs";
import type { ReporteSemana, ResumenSemana } from "../reporteSemana.d.mts";
import { DETALLE_DEMO_BASE } from "../detalle-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { AusenteNominal, DetalleSemanaResponse, FiltroDetalle } from "../types";
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
  return construirReporteSemana(semana, base, resumen);
}
