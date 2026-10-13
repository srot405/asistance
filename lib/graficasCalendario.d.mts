import type { DetalleHistorico, ResumenFiltrado } from "./types";

export type ModoGrafica = "ambos" | "horario" | "colados";
export type SerieGrafica = "horario" | "colados" | "ambos";
export const SERIES_POR_MODO: Record<ModoGrafica, SerieGrafica[]>;
export type PuntoSemana = {
  indice: number; fecha: string; poblacion: number;
  horario: number | null; colados: number | null; ambos: number | null;
  porcentaje_horario: number | null; porcentaje_colados: number | null; porcentaje_ambos: number | null;
  en_curso: boolean;
};
export type SegmentoBarra = { tipo: "horario" | "colados"; desde: number; hasta: number };
export type BarraClase = {
  slot_id: string; fecha: string; poblacion: number; horario: number; colados: number; ambos: number;
  visible: number; segmentos: SegmentoBarra[]; en_curso: boolean;
};
export function semanaAbierta(cerradaEn: string | null | undefined, resumen: Pick<ResumenFiltrado, "en_curso"> | null | undefined): boolean;
export function puntosSemana(porDia: DetalleHistorico[] | null | undefined): PuntoSemana[];
export function barrasDia(porClase: DetalleHistorico[] | null | undefined, fecha: string, modo: ModoGrafica): BarraClase[];
export function techoEje(maximo: number): number;
export function marcasEje(techo: number): number[];
export function valorPunto(punto: PuntoSemana, serie: SerieGrafica): number | null;
export function maximoDia(barras: BarraClase[]): number;
export function coladosProvisionales(modo: ModoGrafica, abierta: boolean): boolean;
