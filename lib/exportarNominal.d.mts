import type { AusenteNominal } from "./types";

export function construirCsvNominal(filas: AusenteNominal[], alcance: "semana" | "dia"): { contenido: string; archivo: string };
