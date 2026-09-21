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
  colados: number;
  falto: number;
  medible: number;
  fueraDato: number;
};
export type DiaResumen = {
  fecha: string;
  counts: Record<string, number>;
  total: number;
  roster: number;
  medible: number;
  entro: number;
  aOtra: number;
  colados: number;
  falto: number;
  fueraDato: number;
};
export type CorteResumen = {
  etiqueta: string;
  roster: number;
  medible: number;
  fueraDato: number;
  entro: number;
  aOtra: number;
  colados: number;
  falto: number;
  si: number;
  asistenciaPct: number;
};
export type DemoData = {
  semana: string;
  materia: string;
  estado_semana: string;
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
};
