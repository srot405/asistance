export declare function indexBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
): Map<unknown, T>;
export declare function filterRoster<
  T extends {
    ciudad: string;
    franja: string;
    nombre: string;
    persona_id: string;
  },
>(roster: T[], filters: Record<string, string>): T[];
export declare function cellsForPeople<
  T extends { persona_id: string; estado: string },
>(
  cells: T[],
  people: Array<{ persona_id: string }>,
  filters: Record<string, string>,
): T[];
export declare function countsByDate<
  T extends { persona_id: string; fecha: string; estado: string },
>(
  cells: T[],
  people: Array<{ persona_id: string }>,
  dates: string[],
): Array<{ fecha: string; counts: Record<string, number>; total: number }>;
export declare function sessionsWithoutData<
  T extends { estado_captura: string },
>(franjas: T[]): T[];
export declare function isWeekOverdue(
  week: { estado_semana: string; semana: string },
  now?: Date,
): boolean;
