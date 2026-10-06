export type FranjaCobertura = {
  slot_id: string; fecha: string; tipo: string; cuenta_zoom: string; horario_texto: string;
  hora_inicio: number; hora_fin: number | null; roster_n: number; captura_automatica: boolean;
};
export type EventoCobertura = { uuid: string; curso: string | null; correo: string | null; nombre: string | null; hora_ms: number };
export type EstadoCobertura = "pendiente" | "sin_entradas_aun" | "en_curso" | "capturada" | "sin_captura";
export type ClaseCobertura = {
  slot_id: string; fecha: string; horario_texto: string; tipo: string; cuenta_zoom: string;
  roster_n: number; captura_automatica: boolean; estado: EstadoCobertura; personas: number; sesiones: number;
};
export type CoberturaCalculada = {
  clases: ClaseCobertura[];
  resumen: { programadas: number; dictadas: number; capturadas: number; faltan: number; pendientes: number };
  sesiones_sin_clase: number;
};
export function calcularCobertura(franjas: FranjaCobertura[], eventos: EventoCobertura[], ahoraMs: number): CoberturaCalculada;
