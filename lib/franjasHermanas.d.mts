export function claveHorario(f: Record<string, unknown> | null | undefined): string | null;
export function hermanasPorSlot(franjas: Record<string, unknown>[], conSemana?: boolean): Map<string, Set<string>>;
export function esSuHorario(slotsPersona: Set<string> | null | undefined, slotEntro: string | null | undefined, hermanas: Map<string, Set<string>> | null | undefined): boolean;
