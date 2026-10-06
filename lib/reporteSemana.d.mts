import type { BaseDetalle } from "./detalleCalculo.d.mts";
export const BOM: string;
export const LEYENDA: string;
export type ResumenSemana = { captura_completa?: boolean | null; nivel?: string; poblacion?: number | null;
  asistieron?: number | null; nunca?: number | null;
  cuadre?: { roster?: number; medibles?: number; sin_dato?: number; sin_clase?: number; pendientes?: number } | null };
export type ReporteSemana = {
  semana: string; completa: boolean; hayRevision: boolean; nivel: string; cuadra: boolean;
  comparacion: { estado: "OK" | "DISCREPA" | "SIN_RESUMEN" | "SIN_COMPARAR"; detalle: string[] };
  multiples: Array<{ franja: string; estados: string[] }>; sinResumen: boolean;
  cuadre: { roster: number; medible: number; fueraDato: number; pendiente: number; sinClase: number };
  sinDato: Array<{ fecha: string; franja: string; estado: string; motivo: string; personas: number }>;
  filas: Array<{ nombre: string; ciudad: string; franja: string; fecha: string; semanal: string; dia: string }>;
};
export function construirReporteSemana(semana: string, base: BaseDetalle & { sesiones?: Array<{ slot_id: string; estado_captura?: string }> },
  resumen?: ResumenSemana | null): ReporteSemana;
export function construirCsvReporte(r: ReporteSemana): { contenido: string; archivo: string };
