export function indexBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
) {
  return new Map(rows.map((row) => [row[key], row]));
}
export function filterRoster<
  T extends {
    ciudad: string;
    franja: string;
    nombre: string;
    persona_id: string;
  },
>(
  roster: T[],
  filters: Record<string, string>,
  slots: Array<{ slot_id: string; cuenta_zoom: string }> = [],
) {
  const query = (filters.buscar || "").toLocaleLowerCase();
  const slotAccounts = new Map(
    slots.map((slot) => [slot.slot_id, slot.cuenta_zoom]),
  );
  return roster.filter(
    (person) =>
      (!filters.ciudad || person.ciudad === filters.ciudad) &&
      (!filters.franja || person.franja === filters.franja) &&
      (!filters.cuenta || slotAccounts.get(person.franja) === filters.cuenta) &&
      (!query ||
        `${person.nombre} ${person.persona_id}`
          .toLocaleLowerCase()
          .includes(query)),
  );
}
export function cellsForPeople<
  T extends { persona_id: string; estado: string },
>(
  cells: T[],
  people: Array<{ persona_id: string }>,
  filters: Record<string, string>,
) {
  const allowed = new Set(people.map((person) => person.persona_id));
  return cells.filter(
    (cell) =>
      allowed.has(cell.persona_id) &&
      (!filters.codigo || cell.estado === filters.codigo),
  );
}
export function countsByDate<
  T extends { persona_id: string; fecha: string; estado: string },
>(cells: T[], people: Array<{ persona_id: string }>, dates: string[]) {
  const allowed = new Set(people.map((person) => person.persona_id));
  return dates.map((fecha) => {
    const counts: Record<string, number> = {};
    cells
      .filter((cell) => cell.fecha === fecha && allowed.has(cell.persona_id))
      .forEach((cell) => {
        counts[cell.estado] = (counts[cell.estado] || 0) + 1;
      });
    return {
      fecha,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    };
  });
}
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
