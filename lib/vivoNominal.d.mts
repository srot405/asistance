import type { EstadoClaseVivo, FranjaVivo } from "./vivoCalculo.d.mts";
export type SenalVivo = "roster" | "otra_franja" | "no_identificado" | "personal";
export type PersonaVivo = {
  senal: SenalVivo; como: string; nombre: string | null; cedula: string | null; ciudad: string | null; correo: string | null;
  su_clase: string | null; primera_entrada: string | null; ultima_salida: string | null; entradas: number; en_sala: boolean;
};
export type ClaseListaVivo = {
  slot_id: string; etiqueta: string; cuenta_zoom: string; estado: EstadoClaseVivo; inicio: string; fin: string; roster_total: number;
  cifras: Record<SenalVivo, { total: number; en_sala: number }>; personas: PersonaVivo[];
};
export type ListaVivoResponse = {
  disponible: boolean; semana: string; hora_servidor: string; actualizado_en: string; clases: ClaseListaVivo[]; aviso_general: string | null;
};
export type EventoCrudo = { id: number; evento: "joined" | "left"; ms: number; correo: string | null; nombre: string | null };
export type SalaCruda = { uuid: string; host: string | null; topic: string | null; activo: boolean; eventos: EventoCrudo[] };
export type FilaRoster = { persona_id: string; correo_norm: string | null; nombre: string | null; ciudad: string | null; slot_id: string | null };
export type FilaRegistrante = { correo_norm: string | null; cedula_digitos: string | null; nombre: string | null; apellido: string | null };
export const SENALES: SenalVivo[];
export const COMO: Record<string, string>;
export const ETIQUETA_SENAL: Record<SenalVivo, string>;
export function cedulaSinCeros(c: unknown): string;
export function esPersonal(correo: unknown, nombre: unknown): boolean;
export function armarListaVivo(a: { semana: string; franjasHoy: FranjaVivo[]; franjasSemana?: FranjaVivo[]; salas: SalaCruda[]; roster: FilaRoster[];
  registrantes: FilaRegistrante[]; ahoraMs: number; actualizadoMs?: number; avisoGeneral?: string | null }): ListaVivoResponse;
export function recortarPorPermiso(r: ListaVivoResponse, permiso: { ciudad: string | null }, mismaCiudad: (a: unknown, b: unknown) => boolean): ListaVivoResponse;
export function filasCsv(r: ListaVivoResponse): (string | number)[][];
