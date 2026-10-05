import "server-only";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase } from "../detalleCalculo.mjs";
import type { CeldaRow, EntradaRow, FranjaRow, RosterRow, SesionRow } from "../detalleCalculo.d.mts";
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

async function tabla<T>(nombre: string, columnas: string, semana: string): Promise<T[]> {
  const { data, error } = await supabaseServidor().from(nombre).select(columnas).eq("semana", semana);
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

async function cargarBaseSupabase(semana: string) {
  const [roster, franjas, sesiones, entradas, celdas] = await Promise.all([
    // correo_norm: solo lo usa la pestaña Presencia (TOC-91, leerPresenciaClase.ts),
    // el resto de este módulo lo ignora.
    tabla<RosterRow>("asist_roster", "persona_id,nombre,ciudad,slot_id,correo_norm", semana),
    // hora_inicio/hora_fin: idem, solo Presencia (lib/horarioFranja.mjs).
    tabla<FranjaRow>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto,hora_inicio,hora_fin", semana),
    tabla<SesionRow>("asist_sesiones", "sesion_id,slot_id,fecha,entradas_totales", semana),
    tabla<EntradaRow>("asist_entradas", "persona_id,sesion_id", semana),
    tabla<CeldaRow>("asist_celda_semana", "persona_id,estado", semana),
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
