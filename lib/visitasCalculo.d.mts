import type { ComparacionBackend, FiltroTiempo, FranjaTiempo, TiempoNoDisponible } from "./tiempoContrato.d.mts";

export const TEXTO_SUPRIMIDO: string;
export const SIN_FRANJA_PROPIA: "";
export const VEREDICTO_VISITA: Readonly<Record<string, string>>;
export function etiquetaMotivo(motivo: string): string;
export function suprimir(n: number): number | null;

// Fila de v_asist_tiempo_persona con es_visita (PII: lleva nombre; solo viaja tras exigirAcceso).
export type FilaVisitaDb = {
  sesion_id: string; franja_tiempo?: string | null; slot_id?: string | null; fecha: string | null; nombre: string | null;
  ciudad: string | null; franja_propia: string | null; estado_tiempo: string; pct_tiempo: number | string | null; es_visita: boolean;
};
export type FilaNoIdentificadoDb = { sesion_id: string; motivo: string; cantidad: number };
export type FilaClaseVisitas = { sesion_id: string; slot_id: string; visitas: number };

export type Visita = {
  visitante: string; ciudad: string; franja_propia: string; horario_propia: string; franja_visitada: string;
  horario_visitada: string; fecha: string; pct_tiempo: number | null; veredicto: string;
};
// n = null -> suprimido (1 a 4 personas): la pantalla muestra «<5».
export type TotalVisitas = { slot_id: string; horario_texto: string; n: number | null };
export type MatrizVisitas = { origenes: TotalVisitas[]; destinos: TotalVisitas[]; celdas: { origen: string; destino: string; n: number | null }[] };
export type VisitasSemanaResponse = {
  disponible: true; semana: string; filtro: { ciudad: string | null; franja: string | null; cuenta: string | null };
  visitas: Visita[]; resumen: { total: number; cumplen: number; rojo: number; sin_dato: number; pendientes: number };
  matriz: MatrizVisitas; sin_identificar: { total: number; por_motivo: { motivo: string; etiqueta: string; cantidad: number }[] };
  cuadre: ComparacionBackend;
};
export type VisitasRespuesta = VisitasSemanaResponse | TiempoNoDisponible;

export function filtrarVisitas(filas: FilaVisitaDb[], franjas: FranjaTiempo[], filtro?: FiltroTiempo): FilaVisitaDb[];
export function cuadrarVisitas(filas: FilaVisitaDb[], clases: FilaClaseVisitas[], franjas: FranjaTiempo[]): ComparacionBackend;
export function armarVisitas(args: { filas: FilaVisitaDb[]; franjas: FranjaTiempo[]; clases?: FilaClaseVisitas[];
  noIdentificados?: FilaNoIdentificadoDb[]; filtro?: FiltroTiempo; semana: string }): VisitasSemanaResponse;
