import type { EstadoClaseVivo, FranjaVivo } from "./vivoCalculo.d.mts";
import type { PresenteZoom } from "./zoomPresentes.d.mts";
export type SenalAsistencia = "roster" | "otra_franja" | "no_identificado" | "personal";
// "ausente" (TOC-153): del roster de esta franja y nunca entro; fila sin entradas, fuera de cifras.
export type SenalVivo = SenalAsistencia | "ausente";
export type PersonaVivo = {
  senal: SenalVivo; como: string; nombre: string | null; cedula: string | null; ciudad: string | null; correo: string | null;
  su_clase: string | null; primera_entrada: string | null; ultima_salida: string | null; entradas: number; en_sala: boolean;
};
export type ClaseListaVivo = {
  slot_id: string; etiqueta: string; cuenta_zoom: string; estado: EstadoClaseVivo; inicio: string; fin: string; roster_total: number;
  cifras: Record<SenalAsistencia, { total: number; en_sala: number }>; personas: PersonaVivo[];
  // TOC-153: del roster de esta franja que nunca entraron (filas senal "ausente"; no suman en cifras). 0 si la clase no ha empezado.
  ausentes: number;
  // TOC-153: de donde sale en_sala: "zoom" (participantes en vivo) o "webhook" (saldo de eventos). Opcional.
  ahora_fuente?: "zoom" | "webhook";
};
export type ListaVivoResponse = {
  disponible: boolean; semana: string; hora_servidor: string; actualizado_en: string; clases: ClaseListaVivo[]; aviso_general: string | null;
};
export type EventoCrudo = { id: number; evento: "joined" | "left"; ms: number; correo: string | null; nombre: string | null };
export type SalaCruda = { uuid: string; host: string | null; topic: string | null; activo: boolean; eventos: EventoCrudo[] };
export type FilaRoster = { persona_id: string; correo_norm: string | null; nombre: string | null; ciudad: string | null; slot_id: string | null };
export type FilaRegistrante = { correo_norm: string | null; cedula_digitos: string | null; nombre: string | null; apellido: string | null };
export const SENALES: SenalAsistencia[];
export const SENAL_AUSENTE: "ausente";
export const COMO: Record<string, string>;
export const ETIQUETA_SENAL: Record<SenalVivo, string>;
export function cedulaSinCeros(c: unknown): string;
export function esPersonal(correo: unknown, nombre: unknown): boolean;
export function armarListaVivo(a: { semana: string; franjasHoy: FranjaVivo[]; franjasSemana?: FranjaVivo[]; salas: SalaCruda[]; roster: FilaRoster[];
  registrantes: FilaRegistrante[]; ahoraMs: number; actualizadoMs?: number; avisoGeneral?: string | null;
  presentesPorSala?: Map<string, PresenteZoom[]> | null }): ListaVivoResponse;
export function recortarPorPermiso(r: ListaVivoResponse, permiso: { ciudad: string | null }, mismaCiudad: (a: unknown, b: unknown) => boolean): ListaVivoResponse;
export function filasCsv(r: ListaVivoResponse): (string | number)[][];
