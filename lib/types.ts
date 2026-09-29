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

export type NivelHistorico = "Detalle" | "Solo semanal" | "Sin dato";
export type DetalleHistorico = {
  fecha: string;
  slot_id?: string;
  poblacion: number;
  asistieron: number;
  nunca: number;
  porcentaje_retencion: number | null;
  porcentaje_nunca: number | null;
};
export type ResumenHistorico = {
  semana: string;
  materia: string;
  nivel: NivelHistorico;
  poblacion: number | null;
  asistieron: number | null;
  nunca: number | null;
  porcentaje_retencion: number | null;
  porcentaje_nunca: number | null;
  clases_programadas: number | null;
  clases_capturadas: number;
  porcentaje_cobertura: number | null;
  captura_completa: boolean;
  // Opcional: columna nueva (migración 078, aún sin aplicar en producción a esta fecha).
  // El sábado de esa semana no tuvo clase regular (24-ago, 21-sep), con evidencia real,
  // nunca por fecha fija -- ver historico_semanal.py::_cobertura(). Ausente = usar el
  // heurístico de respaldo (lib/franjaTipo.mjs::semanaSinSabado) hasta que se recargue.
  sabado_excluido?: boolean;
  aviso: string;
  metodo: string;
  fuentes: string[];
  cuadre: {
    roster: number;
    medibles: number;
    sin_dato: number;
    pendientes: number;
    sin_clase: number;
  };
  detalle_dias: DetalleHistorico[] | null;
  detalle_clases: DetalleHistorico[] | null;
  no_identificados: number;
  nunca_periodo: number | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
};
export type HistoricoData = {
  resultados: ResumenHistorico[];
  nunca_periodo: number | null;
};

// ── Calendario / detalle por día filtrado (TOC-91, 2026-09-29) ──────────────
// Solo existe para semanas nivel "Detalle" (roster congelado real: asist_roster
// con columna ciudad). Ver lib/servidor/leerDetalleSemana.ts.
export type FiltroDetalle = {
  ciudad?: string;
  franja?: string;
  cuenta?: string;
};
export type FranjaInfo = {
  slot_id: string;
  fecha: string;
  cuenta_zoom: string;
  horario_texto: string;
  // Hora entera del día en COT (asist_franjas.hora_inicio/hora_fin, smallint).
  // Solo se usan para la pestaña Presencia (TOC-91, ver lib/horarioFranja.mjs);
  // el resto de vistas del calendario no los necesita.
  hora_inicio?: number;
  hora_fin?: number;
};
// Cifra agregada (sin PII) para un recorte (semana completa o una clase/día).
export type ResumenFiltrado = {
  poblacion: number;
  asistieron: number;
  nunca: number;
  porcentaje_retencion: number | null;
  porcentaje_nunca: number | null;
};
export type DetalleSemanaResponse = {
  semana: string;
  nivel: "Detalle";
  ciudades: string[];
  franjas: FranjaInfo[];
  cuentas: string[];
  filtro: FiltroDetalle;
  resumen: ResumenFiltrado;
  porDia: DetalleHistorico[];
  porClase: DetalleHistorico[];
};
// Fila nominal (PII): solo sale del servidor dentro de un CSV autenticado, nunca
// en una respuesta JSON renderizada en pantalla.
export type AusenteNominal = {
  nombre: string;
  ciudad: string;
  slot_id: string;
  fecha: string;
};

// ── Pestaña "Presencia" (TOC-91, 2026-09-29): Presente/Entró y salió/Nunca
// entró, mismo vocabulario que el reporte en vivo por correo. Solo existe para
// semanas nivel "Detalle" — ver lib/servidor/leerPresenciaClase.ts.
export type EstadoPresencia = "presente" | "entro_y_salio" | "nunca_entro";
export type ConteosPresencia = Record<EstadoPresencia, number>;
export type PresenciaClaseResponse = {
  semana: string;
  slot_id: string;
  fecha: string;
  horario_texto: string;
  medible: number;
  conteos: ConteosPresencia;
  // Personas que sí ingresaron (asist_entradas) pero sin evento crudo
  // joined/left localizable en zoom_live_log dentro de la franja: se cuentan
  // como "entro_y_salio" (conservador: sabemos que entraron, no cuánto se
  // quedaron) y se avisan aparte para no esconder el hueco de datos.
  sin_evidencia: number;
};
// Fila nominal con la clasificación de presencia (PII): mismo criterio que
// AusenteNominal, solo sale por el CSV autenticado de /api/exportar-nominal.
export type PresenciaNominal = {
  nombre: string;
  ciudad: string;
  estado: EstadoPresencia;
  minutos: number | null;
};
