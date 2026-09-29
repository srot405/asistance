import type { AusenteNominal, PresenciaNominal } from "./types";

export function construirCsvNominal(filas: AusenteNominal[], alcance: "semana" | "dia"): { contenido: string; archivo: string };
export function construirCsvPresencia(filas: PresenciaNominal[]): { contenido: string; archivo: string };
