import type { AusenteNominal, PresenciaNominal } from "./types";
import type { FilaCsvTiempo } from "./tiempoContrato.d.mts";

export function construirCsvNominal(filas: AusenteNominal[], alcance: "semana" | "dia"): { contenido: string; archivo: string };
export function construirCsvPresencia(filas: PresenciaNominal[]): { contenido: string; archivo: string };
export const HEADER_CSV_TIEMPO: readonly string[];
export function construirCsvTiempo(filas: FilaCsvTiempo[]): { contenido: string; archivo: string };
