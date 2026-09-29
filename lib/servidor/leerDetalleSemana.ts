import "server-only";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase, SEMANAS_DETALLE } from "../detalleCalculo.mjs";
import type { CeldaRow, EntradaRow, FranjaRow, RosterRow, SesionRow } from "../detalleCalculo.d.mts";
import { DETALLE_DEMO_BASE } from "../detalle-demo.mjs";
import { MODO_DEMO } from "../demo.js";
import type { AusenteNominal, DetalleSemanaResponse, FiltroDetalle } from "../types";
import { supabaseServidor } from "./supabase";

export { SEMANAS_DETALLE };

async function tabla<T>(nombre: string, columnas: string, semana: string): Promise<T[]> {
  const { data, error } = await supabaseServidor().from(nombre).select(columnas).eq("semana", semana);
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

async function cargarBaseSupabase(semana: string) {
  const [roster, franjas, sesiones, entradas, celdas] = await Promise.all([
    tabla<RosterRow>("asist_roster", "persona_id,nombre,ciudad,slot_id", semana),
    tabla<FranjaRow>("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto", semana),
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

async function cargarBase(semana: string) {
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
