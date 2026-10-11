export type FranjaCobertura = {
  slot_id: string; fecha: string; tipo: string; cuenta_zoom: string; horario_texto: string;
  hora_inicio: number; hora_fin: number | null; roster_n: number; captura_automatica: boolean;
};
export type SesionCobertura = { slot_id: string; fecha: string; estado_captura: string | null;
  personas_roster: number | null; personas_visita: number | null };
export type EstadoCobertura = "capturada" | "en_curso" | "pendiente" | "sin_clase" | "zoom_limit" | "dudosa" | "sin_captura" | "sin_sesion";
export type ClaseCobertura = {
  slot_id: string; fecha: string; horario_texto: string; tipo: string; cuenta_zoom: string; hora_inicio: number;
  roster_n: number; captura_automatica: boolean; estado: EstadoCobertura; estado_captura: string | null;
  personas_roster: number | null; personas_visita: number | null; sesiones: number;
};
export type CoberturaCalculada = {
  clases: ClaseCobertura[];
  resumen: { programadas: number; dictadas: number; capturadas: number; en_curso: number; faltan: number; pendientes: number; sin_sesion: number };
  sesiones_sin_clase: number;
};
export const ETIQUETAS_COBERTURA: Readonly<Record<EstadoCobertura, string>>;
export const CSS_COBERTURA: Readonly<Record<EstadoCobertura, string>>;
export function estadoCobertura(sesiones: Pick<SesionCobertura, "estado_captura">[]): EstadoCobertura;
export function calcularCobertura(franjas: FranjaCobertura[], sesiones: SesionCobertura[]): CoberturaCalculada;
