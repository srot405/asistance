import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HISTORICO_DEMO, SOLO_SEMANAL_UX } from "../lib/historico-demo.mjs";

assert.equal(HISTORICO_DEMO.resultados.length, 6, "6 semanas tras quitar HTML/CSS (2026-09-29)");
assert.equal(HISTORICO_DEMO.resultados.filter((fila) => fila.nivel === "Detalle").length, 2);
for (const fila of HISTORICO_DEMO.resultados) {
  if (fila.nivel === "Detalle") assert.ok(fila.detalle_dias?.length, `${fila.semana}: detalle diario`);
  else assert.equal(fila.detalle_dias, null, `${fila.semana}: sin falso detalle diario`);
  assert.equal(fila.cuadre.roster,
    fila.cuadre.medibles + fila.cuadre.sin_dato + fila.cuadre.pendientes + fila.cuadre.sin_clase,
    `${fila.semana}: cuadre completo`);
}
assert.ok(SOLO_SEMANAL_UX.aviso.startsWith(
  "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase."));
for (const fila of HISTORICO_DEMO.resultados.filter((f) => f.nivel === "Solo semanal"))
  assert.ok(fila.aviso.includes("Semana recuperada solo a nivel semanal"), `${fila.semana}: aviso semanal`);
assert.equal(new Set(HISTORICO_DEMO.resultados.map((f) => f.semana)).size, HISTORICO_DEMO.resultados.length,
  "una fila por semana");
const serialized = JSON.stringify(HISTORICO_DEMO);
for (const key of ["nombre", "persona_id", "correo", "cedula", "participantes"])
  assert.equal(serialized.includes(`\"${key}\"`), false, `demo histórico sin ${key}`);
const component = await readFile(new URL("../components/ResumenSemanaVisual.tsx", import.meta.url), "utf8");
assert.doesNotMatch(component, /participant-tile|participant-name|\.nombre\b/);
console.log("RESUMEN: historico=6 filas detalle=2 cuadre=exacto nominal=ausente estado=verde");
