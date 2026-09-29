import type { NivelHistorico, ResumenHistorico } from "./types";

export type PuntoTendencia = {
  indice: number;
  semana: string;
  materia: string;
  nivel: NivelHistorico;
  valor: number | null;
  graficable: boolean;
  esMinimo: boolean;
};
export function puntosTendencia(resultados: ResumenHistorico[]): PuntoTendencia[];
export function tramosTendencia(puntos: PuntoTendencia[]): PuntoTendencia[][];
