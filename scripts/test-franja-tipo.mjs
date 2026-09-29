import assert from "node:assert/strict";
import { esFranjaPresencial } from "../lib/franjaTipo.mjs";

// 2026-09-19 y 2026-09-26 son sábados reales de este proyecto (usados en los fixtures demo).
assert.equal(esFranjaPresencial("2026-09-19"), false, "sábado no es presencial");
assert.equal(esFranjaPresencial("2026-09-26"), false, "sábado no es presencial");
// Martes a viernes de la misma semana: presenciales.
for (const fecha of ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"])
  assert.equal(esFranjaPresencial(fecha), true, `${fecha}: entre semana es presencial`);
console.log("RESUMEN: tests=franja-tipo casos=6 estado=verde");
