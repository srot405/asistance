import type { ComparacionBackend, FilaClaseBackend, FilaTiempoPersona, FiltroTiempo, FranjaTiempo,
  ResumenPersonasTiempo, SemanaSerieTiempo, TiempoSemanaResponse } from "./tiempoContrato.d.mts";
export function cuantil(ordenados: number[], p: number): number | null;
export function percentiles(pcts: number[]): { mediana: number | null; p10: number | null; p90: number | null };
export function normalizarClaseBackend(f: FilaClaseBackend): Record<string, unknown> & { slot_id: string; fecha: string };
export function normalizarResumenPersonas(r: Record<string, unknown> | null | undefined): ResumenPersonasTiempo | null;
export function compararConBackend(personas: FilaTiempoPersona[], clasesBackend: Record<string, unknown>[]): ComparacionBackend;
export function armarTiempoSemana(args: {
  clases: FilaClaseBackend[]; personas: FilaTiempoPersona[]; franjas: FranjaTiempo[]; filtro?: FiltroTiempo;
  info: { semana: string; roster?: number | null; congelada_en?: string | null; reconstruida?: boolean; provisional?: boolean;
    cerrada_en?: string | null; umbral_pct?: number | null; resumen_personas?: ResumenPersonasTiempo | null };
}): TiempoSemanaResponse;
export function armarSerieTiempo(filas: Record<string, unknown>[]): SemanaSerieTiempo[];
