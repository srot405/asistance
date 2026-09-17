export type Code = "V" | "A" | "N" | "R" | "R?" | "ZL" | "P" | "-";
export type RosterPerson = {
  persona_id: string;
  nombre: string;
  ciudad: string;
  franja: string;
};
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
};
export type CellDay = {
  persona_id: string;
  fecha: string;
  estado: Code;
  detalle?: string;
  sala?: string;
  primera_entrada?: string;
  origen?: string;
};
export type CellWeek = {
  persona_id: string;
  estado: "SI" | "NO" | "NO?" | "ZL" | "P";
};
export type DemoData = {
  semana: string;
  materia: string;
  estado_semana: string;
  roster: RosterPerson[];
  franjas: Slot[];
  celdas_dia: CellDay[];
  celdas_semana: CellWeek[];
  no_identificados: Array<{ motivo: string; cantidad: number }>;
  counts: Record<string, number>;
};
