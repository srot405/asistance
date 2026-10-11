import assert from "node:assert/strict";
import { claveHorario, esSuHorario, hermanasPorSlot } from "../lib/franjasHermanas.mjs";
import { calcularDetalleSemana, construirBase } from "../lib/detalleCalculo.mjs";

// Franjas hermanas (2026-10-10): grupos uno/dos del sabado 8:00 se mudaron a una sola sala.
const SAB = "2026-10-10";
const franjas = [
  { slot_id: "sab-08-uno", fecha: SAB, hora_inicio: 8, tipo: "Basico", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 8 uno" },
  { slot_id: "sab-08-dos", fecha: SAB, hora_inicio: 8, tipo: "Basico", cuenta_zoom: "jovenescreativos", horario_texto: "Sábado 8 dos" },
  { slot_id: "sab-08-avanzado", fecha: SAB, hora_inicio: 8, tipo: "Avanzado", cuenta_zoom: "soporte", horario_texto: "Sábado 8 av" },
  { slot_id: "sab-10", fecha: SAB, hora_inicio: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 10" },
];
const h = hermanasPorSlot(franjas);
assert.deepEqual([...h.get("sab-08-uno")].sort(), ["sab-08-dos", "sab-08-uno"]);
assert.deepEqual([...h.get("sab-08-avanzado")], ["sab-08-avanzado"], "avanzado no es hermano del basico a la misma hora");
assert.deepEqual([...h.get("sab-10")], ["sab-10"], "otra hora no es hermana");
assert.ok(esSuHorario(new Set(["sab-08-uno"]), "sab-08-dos", h), "uno en la sala de dos = su horario");
assert.ok(!esSuHorario(new Set(["sab-08-uno"]), "sab-10", h), "uno en la sala de las 10 = colado");
assert.ok(!esSuHorario(new Set(["sab-08-uno"]), "sab-08-avanzado", h), "uno en avanzado = colado");
assert.equal(claveHorario({ slot_id: "x" }), null, "sin fecha/hora solo es hermana de si misma");
assert.deepEqual([...hermanasPorSlot([{ slot_id: "x" }]).get("x")], ["x"]);

// Calendario: el de "uno" que entro a la sala de "dos" cuenta como horario correcto, no como colado.
const sesiones = franjas.map((f) => ({ sesion_id: `s-${f.slot_id}`, slot_id: f.slot_id, fecha: SAB, entradas_totales: 5 }));
const roster = [{ persona_id: "1", nombre: "Uno", ciudad: "Cali", slot_id: "sab-08-uno" }, { persona_id: "2", nombre: "Dos", ciudad: "Cali", slot_id: "sab-08-uno" },
  { persona_id: "3", nombre: "Tres", ciudad: "Cali", slot_id: "sab-08-uno" }];
const entradas = [{ persona_id: "1", sesion_id: "s-sab-08-dos" }, { persona_id: "2", sesion_id: "s-sab-10" }];
const base = construirBase(roster, franjas, sesiones, entradas, roster.map((p) => ({ persona_id: p.persona_id, estado: "SI" })));
const r = calcularDetalleSemana("2026-10-05", base);
assert.deepEqual([r.resumen.horario, r.resumen.colados], [1, 1], "1 en sala hermana = horario; 2 en otra hora = colado");
console.log("test-franjas-hermanas: OK");
