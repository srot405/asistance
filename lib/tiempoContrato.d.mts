// Contrato backend <-> frontend de la vista Tiempo (plan unico PANEL-TIEMPO, B.6/B.7; objetos 082/083).
// El frontend lee SOLO asist_tiempo_clase, v_asist_tiempo_persona, v_asist_tiempo_semana y asist_semana_resumen.tiempo_*.
export type EstadoTiempo = "cumple" | "rojo_tiempo" | "sin_dato_tiempo" | "pendiente";
export type EstadoTiempoCsv = EstadoTiempo | "no_ingreso" | "no_calculado";

// Fila persona-sesion SIN nombre (la unica que viaja dentro del servidor para agregar).
export type FilaTiempoPersona = {
  sesion_id: string; slot_id: string; fecha: string; es_visita: boolean; franja_propia: string | null; ciudad: string | null;
  estado_tiempo: EstadoTiempo; cumple_50: boolean | null; motivo: string | null; pct_tiempo: number | null; segundos: number | null;
};
// Fila de asist_tiempo_clase tal como llega de PostgREST.
export type FilaClaseBackend = {
  sesion_id: string; slot_id: string; fecha: string; estado_captura: string | null; roster_n: number | null;
  ingresaron_propios: number; visitas: number; visitas_cumplen: number; visitas_rojo: number; visitas_sin_dato: number;
  n_medibles: number; n_cumplen: number; n_rojo: number; n_sin_dato: number; n_pendiente: number;
  n_parciales?: number; n_no_medibles?: number; mediana_pct?: number | null; p10_pct?: number | null; p90_pct?: number | null;
  hist?: number[] | null; cobertura?: number | null; fin_clase_min?: number | null; fin_confiable?: boolean;
  clase_evaluable?: boolean; motivo_no_evaluable?: string | null; umbral_pct?: number;
};
export type FranjaTiempo = { slot_id: string; fecha: string; cuenta_zoom: string; horario_texto: string };
export type FiltroTiempo = { ciudad?: string | null; franja?: string | null; cuenta?: string | null };

export type ConteosTiempo = {
  roster: number | null; n_ingresaron: number; n_medibles: number; n_cumplen: number; n_rojo: number; n_sin_dato: number; n_pendiente: number;
  visitas: number; visitas_cumplen: number; visitas_rojo: number; visitas_sin_dato: number;
};
export type DerivadosTiempo = {
  cobertura: number | null; nivel_cobertura: "sin_dato" | "baja" | "ok"; sin_medicion: boolean; sin_ingresos: boolean; muestra_pequena: boolean;
  mediana: number | null; p10: number | null; p90: number | null;
};
export type AgregadoTiempo = ConteosTiempo & DerivadosTiempo;
export type ClaseTiempo = AgregadoTiempo & {
  slot_id: string; fecha: string; horario_texto: string; estado_captura: string | null; fin_clase_min: number | null;
  fin_confiable: boolean; clase_evaluable: boolean; motivo_no_evaluable: string | null;
};
export type DiaTiempo = AgregadoTiempo & { fecha: string };
export type HistogramaTiempo = { bins: { desde: number; hasta: number; n: number; lado: "rojo" | "cumple" }[]; total: number; corte: number };
export type ResumenPersonasTiempo = {
  umbral_pct: number; roster: number; cumplen: number; rojo: number; sin_dato: number; ausentes: number; sin_clase: number;
  pendientes: number; con_entrada: number; medidos: number; cobertura: number | null; definitivo: boolean;
};
export type ComparacionBackend = { estado: "OK" | "DISCREPA" | "SIN_COMPARAR"; detalle: string[] };

export type TiempoSemanaResponse = {
  disponible: true; hay_tiempos: boolean; semana: string; roster: number | null; congelada_en: string | null; reconstruida: boolean;
  provisional: boolean; semana_cerrada_en: string | null; umbral_pct: number | null;
  semana_agregada: AgregadoTiempo; por_dia: DiaTiempo[]; por_clase: ClaseTiempo[]; histograma: HistogramaTiempo | null;
  visitas: { sesiones: number; cumplen: number; rojo: number; sin_dato: number };
  semana_personas: ResumenPersonasTiempo | null; cuadre: { ok: boolean; errores: string[] }; cuadre_backend: ComparacionBackend;
  filtro: { ciudad: string | null; franja: string | null; cuenta: string | null };
  ciudades: string[]; cuentas: string[]; franjas: FranjaTiempo[];
};
export type TiempoNoDisponible = { disponible: false; motivo: string };

export type SemanaSerieTiempo = {
  semana: string; roster: number; n_ingresaron: number; n_medibles: number; n_cumplen: number; n_rojo: number; n_sin_dato: number;
  n_pendiente: number; cobertura: number | null; provisional: boolean; estado_semana: string | null;
  congelada_en: string | null; cerrada_en: string | null;
};
export type TiempoSerieResponse = { disponible: true; semanas: SemanaSerieTiempo[] } | TiempoNoDisponible;

// Fila del CSV nominal (PII: solo sale por CSV autenticado).
export type FilaCsvTiempo = {
  nombre: string; ciudad: string; franja: string; franja_tiempo: string; es_visita: boolean; fecha: string;
  pct_tiempo: number | null; estado_tiempo: EstadoTiempoCsv; cumple_50: boolean | null; minutos: number | null;
  motivo_sin_dato: string | null; definitivo: boolean | null;
};
