import assert from "node:assert/strict";
import { armarIngresosDia, contarPorDia, filasCsvIngresos, filtrarTipo } from "../lib/ingresosDia.mjs";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";

// Botones del calendario: en su horario / se colaron a otra clase / ambos. Datos sinteticos.
const F = "2026-10-10";
const franjas = [{ slot_id: "s8", fecha: F, cuenta_zoom: "comunicaciones", horario_texto: "Sábado 08:00" },
  { slot_id: "s10", fecha: F, cuenta_zoom: "soporte", horario_texto: "Sábado 10:00" },
  { slot_id: "m18", fecha: "2026-10-07", cuenta_zoom: "comunicaciones", horario_texto: "Miércoles 18:00" }];
const sesiones = [{ sesion_id: "a", slot_id: "s8", fecha: F }, { sesion_id: "b", slot_id: "s10", fecha: F }, { sesion_id: "c", slot_id: "m18", fecha: "2026-10-07" }];
const roster = [{ persona_id: "1", nombre: "Uno Demo", ciudad: "Cali", slot_id: "s8" }, { persona_id: "2", nombre: "Dos Demo", ciudad: "Bogotá", slot_id: "s8" },
  { persona_id: "3", nombre: "Tres Demo", ciudad: "Cali", slot_id: "m18" }];
const entradas = [{ persona_id: "1", sesion_id: "a" }, { persona_id: "1", sesion_id: "a" }, { persona_id: "2", sesion_id: "b", primera_entrada: "2026-10-10T15:05:00Z" },
  { persona_id: "3", sesion_id: "a" }, { persona_id: "3", sesion_id: "c" }];
const r = armarIngresosDia({ fecha: F, roster, franjas, sesiones, entradas });
assert.deepEqual(r.conteo, { propias: 1, otras: 2, ambos: 3 }, "duplicado de 1 se cuenta una vez; el miercoles no entra");
const otras = filtrarTipo(r, "otras");
assert.deepEqual(otras.map((f) => f.nombre).sort(), ["Dos Demo", "Tres Demo"]);
assert.equal(otras.find((f) => f.nombre === "Tres Demo").su_clase, "Miércoles 18:00");
assert.equal(filtrarTipo(r, "propias")[0].nombre, "Uno Demo");
// filtros: ciudad = de la persona; franja/cuenta = clase a la que entro
assert.equal(armarIngresosDia({ fecha: F, roster, franjas, sesiones, entradas, filtro: { ciudad: "cali" } }).conteo.ambos, 2);
assert.equal(armarIngresosDia({ fecha: F, roster, franjas, sesiones, entradas, filtro: { franja: "s10" } }).conteo.otras, 1);
assert.equal(armarIngresosDia({ fecha: F, roster, franjas, sesiones, entradas, filtro: { cuenta: "soporte" } }).conteo.ambos, 1);
const csv = filasCsvIngresos(r.filas);
assert.equal(csv.length, 4); assert.equal(csv[1][0], F);
// semana completa: el miercoles entra; conteo por dia
const w = armarIngresosDia({ roster, franjas, sesiones, entradas });
assert.deepEqual(w.conteo, { propias: 2, otras: 2, ambos: 4 });
assert.deepEqual(contarPorDia(w.filas), [{ fecha: "2026-10-07", propias: 1, otras: 0, ambos: 1 }, { fecha: F, propias: 1, otras: 2, ambos: 3 }]);
assert.equal(filasCsvIngresos(w.filas)[1][0], "2026-10-07");
// demo: el fixture sintetico arma sin errores y suma
const sem = Object.keys(DETALLE_DEMO_BASE)[0], fx = DETALLE_DEMO_BASE[sem];
const d = armarIngresosDia({ fecha: fx.sesiones[0].fecha, roster: fx.roster, franjas: fx.franjas, sesiones: fx.sesiones, entradas: fx.entradas });
assert.equal(d.conteo.propias + d.conteo.otras, d.conteo.ambos);
assert.ok(d.conteo.ambos > 0);
console.log("test-ingresos-dia: OK");
