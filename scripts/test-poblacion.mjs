import assert from "node:assert/strict";
import { armarPoblacion, correosABuscar } from "../lib/poblacionCalculo.mjs";

// Poblacion del periodo (TOC-91, auditoria 2026-10-09). Datos sinteticos.
const S1 = "2026-09-28", S2 = "2026-10-05";
const rosterPeriodo = [
  // semana 1
  { semana: S1, persona_id: "1", nombre: "Uno", ciudad: "Cali", correo_norm: "uno@x.test", slot_id: "a" },
  { semana: S1, persona_id: "2", nombre: "Dos", ciudad: "Cali", correo_norm: "dos-viejo@x.test", slot_id: "a" },
  { semana: S1, persona_id: "9", nombre: "Retirado", ciudad: "Cali", correo_norm: "ret@x.test", slot_id: "a" }, // ya no esta en S2
  // semana 2 (poblacion)
  { semana: S2, persona_id: "1", nombre: "Uno", ciudad: "Cali", correo_norm: "uno@x.test", slot_id: "b" },
  { semana: S2, persona_id: "2", nombre: "Dos", ciudad: "Cali", correo_norm: "dos@x.test", slot_id: "b" },
  { semana: S2, persona_id: "3", nombre: "Tres", ciudad: "Bogotá", correo_norm: "tres@x.test", slot_id: "b" },
  { semana: S2, persona_id: "04", nombre: "Cuatro", ciudad: "Quito", correo_norm: "cuatro@x.test", slot_id: "b" },
  { semana: S2, persona_id: "5", nombre: "Cinco", ciudad: "Cali", correo_norm: "cinco@x.test", slot_id: "b" },
];
const franjas = [{ semana: S1, slot_id: "a", horario_texto: "Lunes" }, { semana: S1, slot_id: "z", horario_texto: "Otra" },
  { semana: S2, slot_id: "b", horario_texto: "Martes" }];
const sesiones = [{ semana: S1, sesion_id: "sa", slot_id: "a" }, { semana: S1, sesion_id: "sz", slot_id: "z" }, { semana: S2, sesion_id: "sb", slot_id: "b" }];
const entradas = [
  { semana: S1, persona_id: "1", sesion_id: "sa" },  // 1 entro a su clase
  { semana: S1, persona_id: "2", sesion_id: "sz" },  // 2 solo se colo
  { semana: S1, persona_id: "9", sesion_id: "sa" },
];
// 3: nunca, con registro (por correo). 04: nunca, registrado por cedula SIN el cero. 5: solo en el log crudo.
const registrantes = [{ correo_norm: "tres@x.test", cedula_digitos: "777" }, { correo_norm: "otro4@x.test", cedula_digitos: "4" },
  { correo_norm: "uno@x.test", cedula_digitos: "1" }];
const buscar = correosABuscar({ rosterPeriodo, ultimaSemana: S2, entradas, registrantes });
assert.deepEqual([...buscar.entries()].sort(), [["cinco@x.test", "5"], ["cuatro@x.test", "04"], ["otro4@x.test", "04"], ["tres@x.test", "3"]].sort(),
  "solo quienes no tienen entradas, con sus correos y los del registro que comparten cedula");
const r = armarPoblacion({ rosterPeriodo, ultimaSemana: S2, franjas, entradas, sesiones, registrantes, soloLog: new Set(["5"]), celdas: new Map([["3", "NO?"]]) });
assert.equal(r.poblacion, 5, "el retirado no es poblacion");
assert.deepEqual(r.listas.nunca.map((x) => [x.cedula, x.registrado_zoom]), [["04", "SI"], ["3", "SI"]]);
assert.equal(r.listas.nunca.find((x) => x.cedula === "3").estado_semana, "NO?");
assert.deepEqual(r.listas.solo_log.map((x) => x.cedula), ["5"], "el del log crudo no es 'nunca'");
assert.deepEqual(r.listas.solo_colados.map((x) => [x.cedula, x.clases_a_las_que_entro]), [["2", "Otra"]]);
assert.deepEqual(r.listas.sin_rastro.map((x) => [x.cedula, x.ingreso_periodo]).sort(), [["2", "SI"], ["5", "SI"]].sort(),
  "2 (correos viejo/nuevo sin registro) y 5 (solo log) no estan en el registro");
assert.deepEqual(r.conteos, { nunca: 2, nunca_con_registro: 2, nunca_sin_registro: 0, sin_rastro: 2, solo_colados: 1, solo_log: 1 });
console.log("test-poblacion: OK");
