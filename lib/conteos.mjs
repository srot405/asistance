export function sessionsWithoutData(franjas) {
  return franjas.filter((slot) => ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(slot.estado_captura));
}
export function isWeekOverdue(week, now = new Date()) {
  if (week.estado_semana === "cerrada") return false;
  const monday = new Date(`${week.semana}T00:00:00-05:00`);
  const deadline = new Date(monday.getTime() + 7 * 86400000);
  deadline.setHours(23, 59, 59, 999);
  return now > deadline;
}
