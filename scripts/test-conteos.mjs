import assert from "node:assert/strict";
import {
  countsByDate,
  filterRoster,
  indexBy,
  isWeekOverdue,
  sessionsWithoutData,
} from "../lib/conteos.mjs";
const people = [
  { persona_id: "1", nombre: "Estudiante 001", ciudad: "Bogotá", franja: "a" },
  { persona_id: "2", nombre: "Estudiante 002", ciudad: "Cali", franja: "b" },
];
assert.equal(indexBy(people, "persona_id").get("1").nombre, "Estudiante 001");
assert.equal(filterRoster(people, { ciudad: "Cali" }).length, 1);
assert.deepEqual(
  countsByDate(
    [{ persona_id: "1", fecha: "2026-09-15", estado: "V" }],
    people,
    ["2026-09-15"],
  )[0].counts,
  { V: 1 },
);
assert.equal(
  sessionsWithoutData([
    { estado_captura: "dudosa" },
    { estado_captura: "capturada" },
  ]).length,
  1,
);
assert.equal(
  isWeekOverdue(
    { semana: "2026-09-14", estado_semana: "en_revision" },
    new Date("2026-09-23T01:00:00Z"),
  ),
  true,
);
console.log("RESUMEN: tests=5 estado=verde");
