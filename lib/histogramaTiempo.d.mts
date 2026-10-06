import type { HistogramaTiempo } from "./tiempoContrato.d.mts";
export function indiceBin(pct: number): number;
export function construirHistograma(pctMedidos: (number | null | undefined)[]): HistogramaTiempo;
export function histogramaDesdeHist(hists: (number[] | null | undefined)[]): HistogramaTiempo;
