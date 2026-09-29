import type { RosterRow, FranjaRow, SesionRow, EntradaRow, CeldaRow } from "./detalleCalculo.d.mts";

export const DETALLE_DEMO_BASE: Record<string, {
  roster: RosterRow[]; franjas: FranjaRow[]; sesiones: SesionRow[]; entradas: EntradaRow[]; celdas: CeldaRow[];
}>;
