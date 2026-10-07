export const PRESENCIA: Readonly<{ PRESENTE: "presente"; PARCIAL: "parcial"; NUNCA_ENTRO: "nunca_entro"; SIN_DATO: "sin_dato" }>;
export type EstadoPresenciaOficial = "presente" | "parcial" | "nunca_entro" | "sin_dato";
export function estadoPresenciaOficial(entro: boolean, tiempo: { estado_tiempo?: string | null } | null | undefined): EstadoPresenciaOficial;
export function contarPresencia(estados: EstadoPresenciaOficial[]): Record<EstadoPresenciaOficial, number>;
