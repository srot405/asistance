export function sessionsWithoutData(franjas) {
  return franjas.filter((slot) => ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(slot.estado_captura));
}

export function semanaActualCOT(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type) => Number(parts.find((p) => p.type === type)?.value);
  const local = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}
export function isWeekOverdue(week, now = new Date()) {
  if (week.estado_semana === "cerrada") return false;
  const monday = new Date(`${week.semana}T00:00:00-05:00`);
  const deadline = new Date(monday.getTime() + 7 * 86400000);
  deadline.setHours(23, 59, 59, 999);
  return now > deadline;
}
