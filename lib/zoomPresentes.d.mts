import type { EventoVivo } from "./vivoCalculo.d.mts";
export type ParticipanteZoom = { email?: string | null; user_name?: string | null; name?: string | null; status?: string | null; join_time?: string | null };
export type PresenteZoom = { correo: string | null; nombre: string | null; join_ms: number | null };
export const ESTADO_EN_SALA: string;
export function presentesDeParticipantes(participantes: ParticipanteZoom[] | null | undefined): PresenteZoom[];
export function compactarPresentes(presentes: PresenteZoom[] | null | undefined): EventoVivo[];
