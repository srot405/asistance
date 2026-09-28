export type Code = "V" | "A" | "N" | "R" | "R?" | "ZL" | "P" | "-";
export type Slot = {
  slot_id: string;
  fecha: string;
  cuenta_zoom: string;
  roster_n: number;
  estado_captura: string;
  personas_afectadas: number;
  hora_inicio?: number;
  hora_fin?: number;
  tipo?: string;
  sala?: string;
  captura_automatica?: boolean;
  sesion_id?: string;
  tuvo_clase_virtual?: boolean;
  // Vienen de `asist_sesiones`, unidas por slot_id en /api/datos: describen lo
  // que ocurrió en la franja, no cómo está programada.
  personas_roster?: number;
  personas_visita?: number;
  entradas_totales?: number;
};
export type FranjaResumen = {
  slot_id: string;
  fecha: string;
  roster: number;
  entro: number;
  aOtra: number;
  falto: number;
  medible: number;
  fueraDato: number;
  pendiente: number;
};
export type DiaResumen = {
  fecha: string;
  counts: Record<string, number>;
  total: number;
  roster: number;
  medible: number;
  entro: number;
  aOtra: number;
  falto: number;
  fueraDato: number;
};
export type CorteResumen = {
  etiqueta: string;
  roster: number;
  medible: number;
  fueraDato: number;
  // Personas cuya clase todavía no ocurre: fuera de lo medible, nunca ausentes.
  pendiente: number;
  entro: number;
  aOtra: number;
  falto: number;
  si: number;
  asistenciaPct: number;
};
export type DemoData = {
  semana: string;
  materia: string;
  estado_semana: string;
  semana_registrada: boolean;
  ciudades: string[];
  franjas: Slot[];
  por_franja: FranjaResumen[];
  por_dia: DiaResumen[];
  resumen: CorteResumen;
  por_ciudad: CorteResumen[];
  por_cuenta: CorteResumen[];
  // Personas del canon sin franja asignada esa semana: fuera del roster
  // medible, nunca ausentes. Ver el comentario en lib/agregados.ts.
  sinHorario: number;
  no_identificados: Array<{ motivo: string; cantidad: number }>;
  counts: Record<string, number>;
  franjas_con_clase: Slot[];
  participantes: ParticipanteSemana[];
  dias_visibles: Array<{
    fecha: string;
    noIngresaron: number;
    rescataron: number;
    sinIngresarHastaHoy: number;
  }>;
  faltantes_por_franja: Array<{ slot_id: string; participantes: ParticipanteSemana[] }>;
};

export type ParticipanteSemana = {
  key: string;
  nombre?: string;
  franja: string;
  franjas: string[];
  estado_semana: string;
  propia: boolean;
  rescatada: boolean;
  ingreso_en_semana: boolean;
  falta_hasta_hoy: boolean;
  estado_por_franja: Record<string, string>;
};

export type EstadoVisual = "propia" | "otra" | "sin_ingreso";
export type ParticipanteVisual = ParticipanteSemana & {
  estado_visual: EstadoVisual;
  por_revisar: boolean;
  franja_visual: string;
};
export type CorteVisual = {
  participantes: ParticipanteVisual[];
  grupos: Array<{ slot_id: string; participantes: ParticipanteVisual[] }>;
  faltantes: ParticipanteVisual[];
  grupos_faltantes: Array<{ slot_id: string; participantes: ParticipanteVisual[] }>;
  noIngresaron: number;
  rescataron: number;
  sinIngresarHastaHoy: number;
};
