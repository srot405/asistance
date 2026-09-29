import assert from "node:assert/strict";
import { limitesFranjaMs, msDesdeFechaHoraCOT } from "../lib/horarioFranja.mjs";

// 2026-09-15 18:00 COT == 2026-09-15 23:00 UTC.
const esperado = Date.parse("2026-09-15T23:00:00Z");
assert.equal(msDesdeFechaHoraCOT("2026-09-15", 18), esperado, "18:00 COT = 23:00 UTC");

// Medianoche COT (hora 0) también cae en +05:00 UTC.
assert.equal(msDesdeFechaHoraCOT("2026-09-15", 0), Date.parse("2026-09-15T05:00:00Z"), "00:00 COT = 05:00 UTC");

assert.throws(() => msDesdeFechaHoraCOT("no-es-fecha", 10), RangeError, "fecha inválida lanza RangeError");

const { inicioMs, finMs } = limitesFranjaMs("2026-09-15", 18, 20);
assert.equal(inicioMs, msDesdeFechaHoraCOT("2026-09-15", 18));
assert.equal(finMs, msDesdeFechaHoraCOT("2026-09-15", 20));
assert.equal(finMs - inicioMs, 2 * 60 * 60 * 1000, "franja de 2 horas");

// hora_fin ausente (defensivo: el esquema la declara not null, pero por si acaso):
// usa el mismo default de 120 min que backend/etl/estado_presencia.py.
const sinFin = limitesFranjaMs("2026-09-15", 18, null);
assert.equal(sinFin.finMs - sinFin.inicioMs, 120 * 60 * 1000, "default 120 min si falta hora_fin");

console.log("RESUMEN: tests=horario-franja casos=6 estado=verde");
