import type { AusenteNominal, DetalleSemanaResponse, FiltroDetalle, FranjaInfo, ResumenFiltrado, DetalleHistorico } from "./types";

export type RosterRow = { persona_id: string; nombre: string; ciudad: string; slot_id: string | null;
  // Solo se usa en la pestaña Presencia (TOC-91), para correlacionar con
  // zoom_live_log.correo — el resto del cálculo de detalle no lo necesita.
  correo_norm?: string };
export type FranjaRow = FranjaInfo;
export type SesionRow = { sesion_id: string; slot_id: string; fecha: string; entradas_totales: number; estado_captura?: string };
export type EntradaRow = { persona_id: string; sesion_id: string };
export type CeldaRow = { persona_id: string; estado: string };
export type BaseDetalle = {
  roster: RosterRow[];
  franjas: Map<string, FranjaRow>;
  fechasActivas: Set<string>;
  slotsSinClase: Set<string>;
  celdaPorPersona: Map<string, string>;
  entradaFechaPorPersona: Map<string, Set<string>>;
  entradaSlotPorPersona: Map<string, Set<string>>;
  sesiones: SesionRow[];
};

export function construirBase(roster: RosterRow[], franjas: FranjaRow[], sesiones: SesionRow[],
  entradas: EntradaRow[], celdas: CeldaRow[]): BaseDetalle;
export type Poblacion = "medible" | "pendiente" | "sin_dato" | "sin_clase";
export function clasificar(persona: RosterRow, base: BaseDetalle): Poblacion;
export function entroEnFecha(base: BaseDetalle, personaId: string, fecha: string): boolean;
export function entroAlgunaVez(base: BaseDetalle, personaId: string): boolean;
export type TipoIngreso = "horario" | "colados" | "ambos";
export type IngresoNominal = { tipo: "horario" | "colados"; nombre: string; cedula: string; ciudad: string; su_clase: string; fecha: string; entro_a: string };
export function tipoIngreso(base: BaseDetalle, persona: RosterRow & { persona_id: string }): "horario" | "colados" | null;
export function listarIngresosDesdeBase(base: BaseDetalle, opts: FiltroDetalle & { fecha?: string; tipo: TipoIngreso }): IngresoNominal[];
export function calcularResumen(rosterFiltrado: RosterRow[], base: BaseDetalle): ResumenFiltrado;
export function calcularPorDia(rosterFiltrado: RosterRow[], base: BaseDetalle): DetalleHistorico[];
export function calcularPorClase(rosterFiltrado: RosterRow[], base: BaseDetalle): DetalleHistorico[];
export function calcularDetalleSemana(semana: string, base: BaseDetalle, filtro?: FiltroDetalle): DetalleSemanaResponse;
export function listarAusentesDesdeBase(base: BaseDetalle, opts: FiltroDetalle & { fecha?: string }): AusenteNominal[];
