import assert from "node:assert/strict";
import { fechaCorta, textoBaseSeguimiento } from "../lib/baseSeguimiento.mjs";

// Hora de Colombia (UTC-5): 02:00Z del 6-oct es todavia 5-oct 21:00 en Bogota.
assert.equal(fechaCorta("2026-10-06T02:00:00Z"), "05/10");
assert.equal(fechaCorta("2026-09-28T13:05:00Z"), "28/09");
assert.equal(fechaCorta(null), "");
assert.equal(fechaCorta("no-fecha"), "");
assert.equal(textoBaseSeguimiento(713, "2026-10-06T02:00:00Z"), "Seguimiento: 713 estudiantes (congelado el 05/10)");
assert.equal(textoBaseSeguimiento(713, null), "Seguimiento: 713 estudiantes");
assert.equal(textoBaseSeguimiento(726, "2026-09-16T15:00:00Z", { reconstruida: true }),
  "Seguimiento: 726 estudiantes (reconstruido el 16/09)");
assert.equal(textoBaseSeguimiento(null, "2026-10-06T02:00:00Z"), "");
console.log("RESUMEN: tests_base_seguimiento=7 estado=verde");
