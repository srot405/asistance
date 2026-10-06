import type { VivoResponse } from "./vivoContrato.d.mts";
export type FaseVivo = "cargando" | "ok" | "no_disponible" | "error" | "pausado";
export type EstadoVivo = { fase: FaseVivo; datos: VivoResponse | null; leidoEn: number; errores: number; fallo?: boolean };
export type RespuestaVivo = { status: number; body: unknown };
export function crearControlador(o: {
  pedir: (signal: AbortSignal) => Promise<RespuestaVivo>; alCambiar: (e: EstadoVivo) => void; visible?: () => boolean;
  ahora?: () => number; poner?: (f: () => void, ms: number) => unknown; quitar?: (t: unknown) => void; intervalo?: number;
  estadoInicial?: Partial<EstadoVivo> | null;
}): { estado: () => EstadoVivo; iniciar: () => void; detener: () => void; visibilidad: () => void; reintentar: () => void };
