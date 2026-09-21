export function sessionsWithoutData<T extends { estado_captura: string }>(
  franjas: T[],
) {
  return franjas.filter((slot) =>
    ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(
      slot.estado_captura,
    ),
  );
}
export function isWeekOverdue(
  week: { estado_semana: string; semana: string },
  now = new Date(),
) {
  if (week.estado_semana === "cerrada") return false;
  const monday = new Date(`${week.semana}T00:00:00-05:00`);
  const deadline = new Date(monday.getTime() + 7 * 86400000);
  deadline.setHours(23, 59, 59, 999);
  return now > deadline;
}

// Una semana cuyas clases no han pasado todavía no tiene 0% de asistencia: no
// tiene asistencia aún. Pintarla como 0% junto a semanas reales parece un
// desplome, y es lo primero que alguien malinterpreta en una reunión.
const PENDIENTE = ["por_ocurrir", "en_curso"];
export function yaOcurrio(semana: { franjas: { estado_captura: string }[] }) {
  return semana.franjas.some((f) => !PENDIENTE.includes(f.estado_captura));
}
