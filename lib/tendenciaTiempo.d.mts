import type { ResumenHistorico } from "./types";
import type { SemanaSerieTiempo } from "./tiempoContrato.d.mts";
export type PuntoTendenciaTiempo = {
  indice: number; semana: string; materia: string; tieneFila: boolean; graficable: boolean; valor: number | null;
  n_medibles: number; n_ingresaron: number; n_cumplen: number; n_rojo: number; n_sin_dato: number; cobertura: number | null;
  nivelCobertura: "sin_dato" | "baja" | "ok"; provisional: boolean; sinTiempos: boolean;
};
export function puntosTendenciaTiempo(resultados: ResumenHistorico[], serie: SemanaSerieTiempo[] | null | undefined): PuntoTendenciaTiempo[];
export function tramosTendenciaTiempo(puntos: PuntoTendenciaTiempo[]): PuntoTendenciaTiempo[][];
