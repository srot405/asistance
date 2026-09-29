import assert from "node:assert/strict";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";
import { calcularDetalleSemana, construirBase, SEMANAS_DETALLE } from "../lib/detalleCalculo.mjs";

// El fixture demo cubre exactamente las semanas nivel Detalle, ni una menos ni una de más.
assert.deepEqual(Object.keys(DETALLE_DEMO_BASE).sort(), [...SEMANAS_DETALLE].sort());

for (const [semana, fixture] of Object.entries(DETALLE_DEMO_BASE)) {
  for (const persona of fixture.roster)
    assert.match(persona.nombre, /^Persona Demo \d+$/, `${semana}: nombre claramente sintético`);
  const ids = fixture.roster.map((p) => p.persona_id);
  assert.equal(new Set(ids).size, ids.length, `${semana}: persona_id únicos`);
  const base = construirBase(fixture.roster, fixture.franjas, fixture.sesiones, fixture.entradas, fixture.celdas);
  const detalle = calcularDetalleSemana(semana, base);
  assert.ok(detalle.porDia.length > 0, `${semana}: al menos un día con datos`);
  assert.ok(detalle.ciudades.length > 1, `${semana}: más de una ciudad para probar el filtro`);
  assert.ok(detalle.cuentas.length > 1, `${semana}: más de una cuenta zoom para probar el filtro`);
  assert.equal(detalle.resumen.nunca > 0, true, `${semana}: debe haber al menos un ausente para probar el CSV nominal`);
}
console.log(`RESUMEN: semanas_demo=${Object.keys(DETALLE_DEMO_BASE).length} nombres=sinteticos estado=verde`);
