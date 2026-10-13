import assert from "node:assert/strict";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase } from "../lib/detalleCalculo.mjs";
import { armarPoblacion } from "../lib/poblacionCalculo.mjs";

// Regla unica de colados (Samuel, 2026-10-12, plan-colados-graficas-calendario decisiones 1-3; reemplaza a test-franjas-hermanas):
//  1) entrar a una sala que no es la de su horario es COLADO, sin excepcion de "franja hermana" (sabado 08 uno -> dos incluido);
//  2) el colado cuenta en el dia de SU clase, como colado;
//  3) un colado nunca es ausente ni "nunca ingreso" esa semana.
const SAB = "2026-10-10", MIE = "2026-10-07", SEM = "2026-10-05";
const franjas = [
  { slot_id: "sab-08-uno", fecha: SAB, hora_inicio: 8, tipo: "Basico", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 8 uno" },
  { slot_id: "sab-08-dos", fecha: SAB, hora_inicio: 8, tipo: "Basico", cuenta_zoom: "jovenescreativos", horario_texto: "Sábado 8 dos" },
  { slot_id: "sab-10", fecha: SAB, hora_inicio: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 10" },
  { slot_id: "mie-18", fecha: MIE, hora_inicio: 18, tipo: "Basico", cuenta_zoom: "soporte", horario_texto: "Miércoles 18" },
];
const sesiones = franjas.map((f) => ({ sesion_id: `s-${f.slot_id}`, slot_id: f.slot_id, fecha: f.fecha, entradas_totales: 5 }));
const roster = [
  { persona_id: "1", nombre: "Uno", ciudad: "Cali", slot_id: "sab-08-uno" }, // entra a la sala de "dos" -> colado
  { persona_id: "2", nombre: "Dos", ciudad: "Cali", slot_id: "sab-08-uno" }, // entra a su sala -> horario
  { persona_id: "3", nombre: "Tres", ciudad: "Cali", slot_id: "sab-08-uno" }, // no entra -> nunca
  { persona_id: "4", nombre: "Cuatro", ciudad: "Cali", slot_id: "mie-18" }, // entra el sabado -> colado del miercoles
];
const entradas = [
  { persona_id: "1", sesion_id: "s-sab-08-dos" }, { persona_id: "2", sesion_id: "s-sab-08-uno" },
  { persona_id: "4", sesion_id: "s-sab-10" },
];
const base = construirBase(roster, franjas, sesiones, entradas, roster.map((p) => ({ persona_id: p.persona_id, estado: "SI" })));
const r = calcularDetalleSemana(SEM, base);
assert.deepEqual([r.resumen.horario, r.resumen.colados, r.resumen.nunca], [1, 2, 1], "uno->dos es colado; colados no son nunca");
const uno = r.porClase.find((c) => c.slot_id === "sab-08-uno");
const dos = r.porClase.find((c) => c.slot_id === "sab-08-dos");
assert.deepEqual([uno.horario, uno.colados, uno.nunca], [1, 1, 1], "el colado cuenta en SU clase (08 uno), no en la sala a la que entro");
assert.equal(dos, undefined, "08 dos no tiene roster: no gana a nadie por recibir al de uno");
const mie = r.porDia.find((d) => d.fecha === MIE);
assert.deepEqual([mie.horario, mie.colados, mie.nunca], [0, 1, 0], "el del miercoles que entro el sabado cuenta el miercoles como colado");
assert.deepEqual(listarAusentesDesdeBase(base, {}).map((a) => a.nombre), ["Tres"], "ningun colado sale como ausente");

// Poblacion del periodo: los colados (incluido uno->dos) van a solo_colados y nunca a "nunca ingresaron".
const conSemana = (x) => x.map((f) => ({ ...f, semana: SEM }));
const p = armarPoblacion({ rosterPeriodo: conSemana(roster), ultimaSemana: SEM, franjas: conSemana(franjas),
  entradas: conSemana(entradas), sesiones: conSemana(sesiones), registrantes: [] });
assert.deepEqual(p.listas.solo_colados.map((x) => x.cedula).sort(), ["1", "4"]);
assert.deepEqual(p.listas.nunca.map((x) => x.cedula), ["3"]);
console.log("test-colados-sin-hermanas: OK");
