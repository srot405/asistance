export function construirCsv(data: {
  por_franja: Array<{ fecha: string; slot_id: string; roster: number; entro: number; aOtra: number; falto: number }>;
  franjas_con_clase: Array<{ slot_id: string }>;
  participantes: Array<{ nombre?: string; franja: string; estado_semana: string; estado_por_franja: Record<string, string> }>;
}, vista: string, demo?: boolean): { contenido: string; archivo: string };
