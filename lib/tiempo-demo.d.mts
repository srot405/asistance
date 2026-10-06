import type { FilaClaseBackend, FranjaTiempo } from "./tiempoContrato.d.mts";

// Fila persona-sesion del demo: incluye nombre/persona_id SINTETICOS ("Persona Demo NNN") solo para el CSV demo.
export type FilaPersonaDemo = {
  sesion_id: string; slot_id: string; fecha: string; es_visita: boolean; franja_propia: string; ciudad: string;
  persona_id: string; nombre: string; segundos: number | null; pct_tiempo: number | null;
  estado_tiempo: "cumple" | "rojo_tiempo" | "sin_dato_tiempo"; cumple_50: boolean | null; motivo: string | null;
};
export type SemanaTiempoDemo = {
  clases: FilaClaseBackend[]; personas: FilaPersonaDemo[]; franjas: FranjaTiempo[];
  info: { semana: string; roster: number; congelada_en: string; reconstruida: boolean; provisional: boolean; cerrada_en: string | null; umbral_pct: number };
  resumenFila: Record<string, number | boolean | null>; filaSerie: Record<string, unknown>;
  semanalPorPersona: Map<string, { estado_tiempo: string; cumple_50: boolean | null; motivo: string | null; mejor_pct: number | null;
    minutos_max: number | null; sesiones_consideradas: number; definitivo: boolean }>;
};
export const TIEMPO_DEMO: Record<string, SemanaTiempoDemo>;
export const TIEMPO_DEMO_SERIE: Record<string, unknown>[];
