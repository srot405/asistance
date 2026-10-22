export type ClaveConfianza = "capturada" | "zoom_limit" | "dudosa" | "sin_captura" | "por_ocurrir" | "en_curso" | "sin_clase";
export type EstadoCuadreClase = "cuadrada" | "cuadrada_interna" | "parcial" | "con_diferencias" | "sin_cuadre";
export const CONFIANZA: Readonly<Record<string, ClaveConfianza>>;
export const CHIPS_CONFIANZA: Readonly<Record<ClaveConfianza, { icono: string; texto: string; ayuda: string }>>;
export const TEXTO_CUADRE: Readonly<Record<EstadoCuadreClase, string>>;
export const AYUDA_CUADRE: Readonly<Record<EstadoCuadreClase, string>>;
export const MOTIVO_PARCIAL: Readonly<Record<string, string>>;
export function confianzaDeCaptura(estadoCaptura: string | null | undefined): ClaveConfianza;

export type SesionConfianzaDb = { sesion_id: string; slot_id: string; fecha: string; estado_captura: string };
export type CuadreClaseDb = { sesion_id: string; slot_id: string; n_panel: number | null; n_api: number | null; n_webhook: number | null;
  n_ok?: number; n_diferencias: number; n_informativas: number; estado: "ok" | "con_diferencias" | "parcial" | "pendiente";
  nivel?: "completo" | "parcial" | "interno" | "no_aplica" | null; origen?: string | null; motivo?: string | null };
export type CuadreClase = { estado: EstadoCuadreClase; motivo: string | null; n_diferencias: number; n_informativas: number;
  n_panel: number | null; n_api: number | null; n_webhook: number | null };
export type ConfianzaClase = { slot_id: string; fecha: string; confianza: ClaveConfianza; estado_captura: string; cuadre: CuadreClase | null };
export type ConfianzaSemanaResponse = { disponible: true; semana: string; cuadre_disponible: boolean; clases: ConfianzaClase[];
  resumen: { clases: number; capturadas: number; cuadradas: number; con_diferencias: number; parciales: number; sin_cuadre: number } };

export function armarConfianza(args: { semana: string; sesiones: SesionConfianzaDb[]; cuadre: CuadreClaseDb[] | null }): ConfianzaSemanaResponse;
export function cuadreSinteticoDemo(sesiones: (SesionConfianzaDb & { entradas_totales?: number })[]): CuadreClaseDb[];
