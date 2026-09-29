export const UMBRAL_PRESENTE: number;
export const DURACION_FRANJA_DEFECTO_MIN: number;
export const ESTADO_PRESENTE: "presente";
export const ESTADO_ENTRO_Y_SALIO: "entro_y_salio";
export const ESTADO_NUNCA_ENTRO: "nunca_entro";

export type EventoCrudo = { evento: "joined" | "left"; hora_ms: number };
export type ResultadoPresencia = { estado: "presente" | "entro_y_salio" | "nunca_entro";
  minutos: number; porcentaje: number | null };

export function construirIntervalos(eventos: EventoCrudo[], finFranjaMs: number): [number, number][];
export function minutosEnSala(eventos: EventoCrudo[], inicioFranjaMs: number, finFranjaMs: number): number;
export function clasificarPresencia(eventos: EventoCrudo[], inicioFranjaMs: number, finFranjaMs: number): ResultadoPresencia;
export function duracionFranjaMs(horaInicioMs: number, horaFinMs: number | null | undefined, minutosDefecto?: number): number;
export function clasificarGrupo(eventosPorPersona: Record<string, EventoCrudo[]> | Map<string, EventoCrudo[]>,
  inicioFranjaMs: number, finFranjaMs: number): {
    conteos: Record<"presente" | "entro_y_salio" | "nunca_entro", number>;
    detalle: Record<string, ResultadoPresencia>;
  };
