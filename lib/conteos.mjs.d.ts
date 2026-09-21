export declare function sessionsWithoutData<T extends { estado_captura: string }>(franjas: T[]): T[];
export declare function isWeekOverdue(week: { estado_semana: string; semana: string }, now?: Date): boolean;
