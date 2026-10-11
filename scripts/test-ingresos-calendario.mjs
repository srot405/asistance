import assert from "node:assert/strict";
import { calcularDetalleSemana, construirBase } from "../lib/detalleCalculo.mjs";

// Selector de vista del calendario (TOC-91): «Entraron en su horario» / «Se colaron» / «Todos los ingresos». Datos sinteticos.
const franjas = [
  { slot_id: "mar", fecha: "2026-10-06", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00" },
  { slot_id: "mie", fecha: "2026-10-07", cuenta_zoom: "soporte", horario_texto: "Miércoles 18:00" },
];
const sesiones = [{ sesion_id: "s-mar", slot_id: "mar", fecha: "2026-10-06", entradas_totales: 9 },
  { sesion_id: "s-mie", slot_id: "mie", fecha: "2026-10-07", entradas_totales: 9 }];
const roster = [
  { persona_id: "1", nombre: "Uno", ciudad: "Cali", slot_id: "mar" },     // entra a su clase
  { persona_id: "2", nombre: "Dos", ciudad: "Bogotá", slot_id: "mar" },   // entra a su clase y ademas se cuela el miercoles
  { persona_id: "3", nombre: "Tres", ciudad: "Cali", slot_id: "mar" },    // no entra
  { persona_id: "4", nombre: "Cuatro", ciudad: "Cali", slot_id: "mie" },  // solo se cuela el martes (no entra a la suya)
  { persona_id: "5", nombre: "Cinco", ciudad: "Bogotá", slot_id: "mie" }, // entra a su clase
];
const celdas = roster.map((p) => ({ persona_id: p.persona_id, estado: p.persona_id === "3" ? "NO" : "SI" }));
const entradas = [{ persona_id: "1", sesion_id: "s-mar" }, { persona_id: "2", sesion_id: "s-mar" }, { persona_id: "2", sesion_id: "s-mie" },
  { persona_id: "4", sesion_id: "s-mar" }, { persona_id: "5", sesion_id: "s-mie" }, { persona_id: "9", sesion_id: "s-mie" }]; // 9 fuera del roster
const base = construirBase(roster, franjas, sesiones, entradas, celdas);
const r = calcularDetalleSemana("2026-10-05", base);
const mar = r.porDia.find((d) => d.fecha === "2026-10-06"), mie = r.porDia.find((d) => d.fecha === "2026-10-07");

// En su horario: misma poblacion que el % oficial, siempre <= asistieron
assert.equal(mar.poblacion, 3); assert.equal(mar.asistieron, 2); assert.equal(mar.en_su_horario, 2);
assert.equal(mie.poblacion, 2); assert.equal(mie.asistieron, 1, "el oficial: 4 entro el martes, no el miercoles");
assert.equal(mie.en_su_horario, 1);
for (const d of [...r.porDia, ...r.porClase, r.resumen]) assert.ok(d.en_su_horario <= d.asistieron, "en su horario nunca supera al % oficial");
assert.equal(r.resumen.en_su_horario, 3, "1, 2 y 5 entraron a su clase; 4 solo se colo");
// Colados: se cuentan en la clase QUE RECIBE; % sobre todos los que entraron a esa clase
assert.equal(mar.colados, 1); assert.equal(mar.ingresos, 3); assert.equal(mar.porcentaje_colados, 33.33);
assert.equal(mie.colados, 2, "2 (del martes) y 9 (fuera del roster)"); assert.equal(mie.ingresos, 3);
assert.equal(r.resumen.ingresos, 6); assert.equal(r.resumen.colados, 3);
assert.deepEqual(r.porClase.map((c) => [c.slot_id, c.colados, c.ingresos]), [["mar", 1, 3], ["mie", 2, 3]]);
// Filtros: ciudad = de la persona (9 sin ciudad sale); franja/cuenta = clase que recibe
const cali = calcularDetalleSemana("2026-10-05", base, { ciudad: "cali" });
assert.equal(cali.resumen.colados, 1, "solo 4 (Cali) se colo; 2 es de Bogotá y 9 no tiene ciudad");
const soporte = calcularDetalleSemana("2026-10-05", base, { cuenta: "soporte" });
assert.equal(soporte.resumen.ingresos, 3); assert.equal(soporte.resumen.colados, 2);
// Las cifras oficiales no cambian
assert.equal(r.resumen.asistieron, 4); assert.equal(r.resumen.poblacion, 5);
console.log("test-ingresos-calendario: OK");
