import assert from "node:assert/strict";
import { calcularDetalleSemana, construirBase, listarIngresosDesdeBase } from "../lib/detalleCalculo.mjs";

// Filtros del calendario (TOC-91): horario correcto / solo colados / ambos, contados en el dia de la clase DE LA PERSONA.
const franjas = [
  { slot_id: "mar", fecha: "2026-10-06", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00" },
  { slot_id: "mie", fecha: "2026-10-07", cuenta_zoom: "soporte", horario_texto: "Miércoles 18:00" },
];
const sesiones = [{ sesion_id: "s-mar", slot_id: "mar", fecha: "2026-10-06", entradas_totales: 9 },
  { sesion_id: "s-mie", slot_id: "mie", fecha: "2026-10-07", entradas_totales: 9 }];
const roster = [
  { persona_id: "1", nombre: "Uno", ciudad: "Cali", slot_id: "mar" },     // entra a su clase
  { persona_id: "2", nombre: "Dos", ciudad: "Bogotá", slot_id: "mar" },   // entra a su clase y ademas a la del miercoles
  { persona_id: "3", nombre: "Tres", ciudad: "Cali", slot_id: "mar" },    // no entra
  { persona_id: "6", nombre: "Seis", ciudad: "Cali", slot_id: "mar" },    // del martes, solo entra el miercoles -> colado DEL MARTES
  { persona_id: "4", nombre: "Cuatro", ciudad: "Cali", slot_id: "mie" },  // del miercoles, solo entra el martes -> colado DEL MIERCOLES
  { persona_id: "5", nombre: "Cinco", ciudad: "Bogotá", slot_id: "mie" }, // entra a su clase
];
const celdas = roster.map((p) => ({ persona_id: p.persona_id, estado: p.persona_id === "3" ? "NO" : "SI" }));
const entradas = [{ persona_id: "1", sesion_id: "s-mar" }, { persona_id: "2", sesion_id: "s-mar" }, { persona_id: "2", sesion_id: "s-mie" },
  { persona_id: "6", sesion_id: "s-mie" }, { persona_id: "4", sesion_id: "s-mar" }, { persona_id: "5", sesion_id: "s-mie" },
  { persona_id: "9", sesion_id: "s-mie" }]; // 9 fuera del roster: no cuenta (no tiene roster/dia propio)
const base = construirBase(roster, franjas, sesiones, entradas, celdas);
const r = calcularDetalleSemana("2026-10-05", base);
const mar = r.porDia.find((d) => d.fecha === "2026-10-06"), mie = r.porDia.find((d) => d.fecha === "2026-10-07");

// martes: roster 4 (1,2,3,6). horario 2 (1,2), colados 1 (6 entro el miercoles y se ve EL MARTES), ambos 3
assert.deepEqual([mar.poblacion, mar.horario, mar.colados, mar.ambos], [4, 2, 1, 3]);
assert.equal(mar.porcentaje_horario, 50); assert.equal(mar.porcentaje_colados, 25); assert.equal(mar.porcentaje_ambos, 75);
// miercoles: roster 2 (4,5). horario 1 (5), colados 1 (4 entro el martes)
assert.deepEqual([mie.poblacion, mie.horario, mie.colados, mie.ambos], [2, 1, 1, 2]);
// ambos = horario + colados, nunca mas que el roster (grupos disjuntos: 2 entro a su clase y a otra, cuenta solo en horario)
for (const d of [...r.porDia, ...r.porClase, r.resumen]) {
  assert.equal(d.ambos, d.horario + d.colados);
  assert.ok(d.ambos <= d.poblacion);
}
assert.deepEqual([r.resumen.horario, r.resumen.colados, r.resumen.ambos], [3, 2, 5]);
// filtros (los del calendario: de la persona)
const cali = calcularDetalleSemana("2026-10-05", base, { ciudad: "cali" });
assert.deepEqual([cali.resumen.poblacion, cali.resumen.horario, cali.resumen.colados], [4, 1, 2]);
// las cifras oficiales no cambian
assert.equal(r.resumen.asistieron, 5); assert.equal(r.resumen.poblacion, 6);
// nominal (CSV): mismo criterio
const colMar = listarIngresosDesdeBase(base, { tipo: "colados", fecha: "2026-10-06" });
assert.deepEqual(colMar.map((f) => [f.nombre, f.su_clase, f.entro_a]), [["Seis", "Martes 18:00", "Miércoles 18:00"]]);
assert.equal(listarIngresosDesdeBase(base, { tipo: "ambos" }).length, 5);
assert.equal(listarIngresosDesdeBase(base, { tipo: "horario", ciudad: "Bogotá" }).length, 2);
console.log("test-ingresos-calendario: OK");
