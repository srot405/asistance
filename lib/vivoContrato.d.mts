// Contrato de GET /api/vivo (lo produce el agente A). Solo conteos: nunca nombres ni correos.
export type EstadoClaseVivo = "abierta" | "proxima" | "terminada" | "sin_sala";
export type ClaseVivo = {
  slot_id: string; etiqueta: string; cuenta_zoom: string; inicio: string; fin: string;
  estado: EstadoClaseVivo; sala_activa: boolean;
  // roster_* cuenta SOLO el roster de la franja de esta clase (roster_maximo <= roster_total salvo datos incoherentes: la pantalla lo recorta).
  roster_total: number; roster_maximo: number; roster_ahora_aprox: number;
  // Alumnos del roster de OTRA franja que entraron a esta sala. Opcionales; no se suman al roster ni a desconocidos.
  otra_franja_maximo?: number; otra_franja_ahora_aprox?: number;
  desconocidos_maximo: number; desconocidos_ahora_aprox: number;
  personal_maximo: number; personal_ahora_aprox: number;
  ultima_actividad: string | null; eventos: number; cobertura_baja: boolean; aviso: string | null;
  // TOC-153: de donde salen los *_ahora_aprox: "zoom" (participantes en vivo) o "webhook" (saldo de eventos). Opcional.
  ahora_fuente?: "zoom" | "webhook";
};
export type VivoResponse = {
  // actualizado_en = momento REAL de la ultima lectura a Supabase; hora_servidor = momento de esta respuesta.
  disponible: boolean; actualizado_en: string; semana: string; hora_servidor: string;
  clases: ClaseVivo[]; aviso_general: string | null;
};
