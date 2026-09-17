export function indexBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

export function filterRoster(roster, filters) {
  const query = (filters.buscar || "").toLocaleLowerCase();
  return roster.filter(
    (person) =>
      (!filters.ciudad || person.ciudad === filters.ciudad) &&
      (!filters.franja || person.franja === filters.franja) &&
      (!query ||
        `${person.nombre} ${person.persona_id}`
          .toLocaleLowerCase()
          .includes(query)),
  );
}

export function cellsForPeople(cells, people, filters) {
  const allowed = new Set(people.map((person) => person.persona_id));
  return cells.filter(
    (cell) =>
      allowed.has(cell.persona_id) &&
      (!filters.codigo || cell.estado === filters.codigo),
  );
}

export function countsByDate(cells, people, dates) {
  const peopleIds = new Set(people.map((person) => person.persona_id));
  return dates.map((fecha) => {
    const counts = {};
    cells
      .filter((cell) => cell.fecha === fecha && peopleIds.has(cell.persona_id))
      .forEach((cell) => {
        counts[cell.estado] = (counts[cell.estado] || 0) + 1;
      });
    return {
      fecha,
      counts,
      total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    };
  });
}

export function sessionsWithoutData(franjas) {
  return franjas.filter((slot) =>
    ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(
      slot.estado_captura,
    ),
  );
}

export function isWeekOverdue(week, now = new Date()) {
  if (week.estado_semana === "cerrada") return false;
  const monday = new Date(`${week.semana}T00:00:00-05:00`);
  const deadline = new Date(monday.getTime() + 7 * 86400000);
  deadline.setHours(23, 59, 59, 999);
  return now > deadline;
}
