export type ColorPermanencia = "rojo" | "amarillo" | "verde" | "sin_dato";
export function colorPermanencia(pct: number | null | undefined): ColorPermanencia;
export function textoIngreso(entro: boolean | null | undefined): "Sí" | "No" | "Sin dato";
export function ingresoClase(tieneEntrada: boolean, tieneTiempo: boolean, capturaCompleta: boolean): boolean | null;
export function resumirPermanencia(filas: { ingreso: boolean | null; pct: number | null }[]): {
  ingreso: { si: number; no: number; sin_dato: number };
  permanencia: Record<ColorPermanencia, number>;
};
