import type { BaseDetalle } from "./detalleCalculo.d.mts";
export const BOM: string;
export const LEYENDA: string;
export type ReporteSemana = {
  semana: string; completa: boolean; hayRevision: boolean; nivel: string; cuadra: boolean;
  cuadre: { roster: number; medible: number; fueraDato: number; pendiente: number; sinClase: number };
  sinDato: Array<{ fecha: string; franja: string; estado: string; motivo: string; personas: number }>;
  filas: Array<{ nombre: string; ciudad: string; franja: string; fecha: string; semanal: string; dia: string }>;
};
export function construirReporteSemana(semana: string, base: BaseDetalle & { sesiones?: Array<{ slot_id: string; estado_captura?: string }> },
  resumen?: { captura_completa?: boolean | null; nivel?: string } | null): ReporteSemana;
export function construirCsvReporte(r: ReporteSemana): { contenido: string; archivo: string };
