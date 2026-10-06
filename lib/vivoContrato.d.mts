// Contrato de GET /api/vivo (lo produce el agente A). Solo conteos: nunca nombres ni correos.
export type EstadoClaseVivo = "abierta" | "proxima" | "terminada" | "sin_sala";
export type ClaseVivo = {
  slot_id: string; etiqueta: string; cuenta_zoom: string; inicio: string; fin: string;
  estado: EstadoClaseVivo; sala_activa: boolean;
  roster_total: number; roster_maximo: number; roster_ahora_aprox: number;
  desconocidos_maximo: number; desconocidos_ahora_aprox: number;
  personal_maximo: number; personal_ahora_aprox: number;
  ultima_actividad: string | null; eventos: number; cobertura_baja: boolean; aviso: string | null;
};
export type VivoResponse = {
  disponible: boolean; actualizado_en: string; semana: string; hora_servidor: string;
  clases: ClaseVivo[]; aviso_general: string | null;
};
