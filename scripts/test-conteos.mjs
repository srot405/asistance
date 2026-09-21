import assert from "node:assert/strict";
import { isWeekOverdue, sessionsWithoutData } from "../lib/conteos.mjs";
assert.equal(sessionsWithoutData([{ estado_captura: "dudosa" }, { estado_captura: "capturada" }]).length, 1);
assert.equal(isWeekOverdue({ semana: "2026-09-14", estado_semana: "en_revision" }, new Date("2026-09-23T01:00:00Z")), true);
assert.equal(isWeekOverdue({ semana: "2026-09-14", estado_semana: "cerrada" }, new Date("2026-09-23T01:00:00Z")), false);
console.log("RESUMEN: tests=3 estado=verde conteos=agregados");
