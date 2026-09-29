import type { AusenteNominal, DetalleSemanaResponse, FiltroDetalle, FranjaInfo, ResumenFiltrado, DetalleHistorico } from "./types";

export type RosterRow = { persona_id: string; nombre: string; ciudad: string; slot_id: string | null };
export type FranjaRow = FranjaInfo;
export type SesionRow = { sesion_id: string; slot_id: string; fecha: string; entradas_totales: number };
export type EntradaRow = { persona_id: string; sesion_id: string };
export type CeldaRow = { persona_id: string; estado: string };
export type BaseDetalle = {
  roster: RosterRow[];
  franjas: Map<string, FranjaRow>;
  fechasActivas: Set<string>;
  slotsSinClase: Set<string>;
  celdaPorPersona: Map<string, string>;
  entradaFechaPorPersona: Map<string, Set<string>>;
};

export const SEMANAS_DETALLE: Set<string>;
export function construirBase(roster: RosterRow[], franjas: FranjaRow[], sesiones: SesionRow[],
  entradas: EntradaRow[], celdas: CeldaRow[]): BaseDetalle;
export function calcularResumen(rosterFiltrado: RosterRow[], base: BaseDetalle): ResumenFiltrado;
export function calcularPorDia(rosterFiltrado: RosterRow[], base: BaseDetalle): DetalleHistorico[];
export function calcularPorClase(rosterFiltrado: RosterRow[], base: BaseDetalle): DetalleHistorico[];
export function calcularDetalleSemana(semana: string, base: BaseDetalle, filtro?: FiltroDetalle): DetalleSemanaResponse;
export function listarAusentesDesdeBase(base: BaseDetalle, opts: FiltroDetalle & { fecha?: string }): AusenteNominal[];
