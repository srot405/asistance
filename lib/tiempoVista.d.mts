import type { ConteosTiempo } from "./tiempoContrato.d.mts";

export const UMBRAL_PORCENTAJE_ROJO: 50;
export { colorPermanencia } from "./permanencia.mjs";
export const COBERTURA_MINIMA_COMPARABLE: 0.7;
export const MUESTRA_MINIMA: 5;
export const BINS_PCT: 10;
export const ESTADO_TIEMPO: Readonly<{
  CUMPLE: "cumple"; ROJO: "rojo_tiempo"; SIN_DATO: "sin_dato_tiempo"; PENDIENTE: "pendiente"; AUSENTE: "ausente";
  SIN_CLASE: "sin_clase"; NO_INGRESO: "no_ingreso"; NO_CALCULADO: "no_calculado";
}>;
export const ETIQUETAS: Readonly<Record<"cumple" | "rojo_tiempo" | "no_ingreso" | "sin_dato_tiempo", string>>;
export const ICONOS: Readonly<Record<"cumple" | "rojo_tiempo" | "no_ingreso" | "sin_dato_tiempo", string>>;
export const TEXTO_NO_DISPONIBLE: string;
export const TEXTO_SIN_DATO_AYUDA: string;
export const LEYENDA_VISITAS: string;
export const TEXTO_ROJO_SEMANAL: string;
export function cumple50(segundosPresente: number | null, segundosVentana: number | null): boolean | null;
export function cumple50Pct(pct: number | null): boolean | null;
export function pctTiempo(segundosPresente: number | null, segundosVentana: number | null): number | null;
type Cont = Pick<ConteosTiempo, "n_ingresaron" | "n_medibles" | "n_cumplen" | "n_rojo" | "n_sin_dato" | "n_pendiente">;
export function sumarConteos(filas: Partial<ConteosTiempo>[]): ConteosTiempo;
export function porcentajeCumple(c: Pick<Cont, "n_medibles" | "n_cumplen"> | null): number | null;
export function porcentajeRojo(c: Pick<Cont, "n_medibles" | "n_rojo"> | null): number | null;
export function coberturaTiempo(c: Pick<Cont, "n_ingresaron" | "n_medibles"> | null): number | null;
export function textoCobertura(c: Pick<Cont, "n_ingresaron" | "n_medibles"> | null): string;
export function porcentajeUnDecimal(valor: number | null): string;
export function porcentajeTexto(valor: number | null): string;
export function nivelCobertura(cobertura: number | null | Pick<Cont, "n_ingresaron" | "n_medibles">): "sin_dato" | "baja" | "ok";
export function cuadreTiempo(c: Cont): { ok: boolean; errores: string[] };
export function estadoVistaTiempo(
  respuesta: { disponible?: boolean; hay_tiempos?: boolean } | null | undefined,
  error?: { status?: number } | null,
): "cargando" | "ok" | "no_disponible" | "vacio" | "no_detalle" | "error";
export function textoCumple50(valor: boolean | null | undefined): "SI" | "NO" | "";
