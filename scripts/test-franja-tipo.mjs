import assert from "node:assert/strict";
import { esFranjaPresencial, semanaSinSabado } from "../lib/franjaTipo.mjs";

// 2026-09-19 y 2026-09-26 son sábados reales de este proyecto (usados en los fixtures demo).
assert.equal(esFranjaPresencial("2026-09-19"), false, "sábado no es presencial");
assert.equal(esFranjaPresencial("2026-09-26"), false, "sábado no es presencial");
// Martes a viernes de la misma semana: presenciales.
for (const fecha of ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"])
  assert.equal(esFranjaPresencial(fecha), true, `${fecha}: entre semana es presencial`);

// ── semanaSinSabado (TOC-91, 2026-09-29): mismo patrón real que produce
// backend/etl/historico_semanal.py --dry-run contra Supabase para la materia "Backend"
// de septiembre -- 2026-09-14 con sábado activo, 2026-09-21 sin ninguna fecha de sábado
// en detalle_dias y con cuadre.sin_clase > 0 (las franjas de sábado excluidas).
const AHORA = new Date("2026-09-29T12:00:00-05:00"); // fija "hoy" para que los tests no dependan de la fecha real
const semanaConSabado = { semana: "2026-09-14", materia: "Backend", nivel: "Detalle",
  cuadre: { roster: 726, medibles: 726, sin_dato: 0, pendientes: 0, sin_clase: 0 },
  detalle_dias: [{ fecha: "2026-09-15" }, { fecha: "2026-09-16" }, { fecha: "2026-09-17" },
    { fecha: "2026-09-18" }, { fecha: "2026-09-19" }] };
const semanaSinSabadoReal = { semana: "2026-09-21", materia: "Backend", nivel: "Detalle",
  cuadre: { roster: 726, medibles: 258, sin_dato: 0, pendientes: 0, sin_clase: 468 },
  detalle_dias: [{ fecha: "2026-09-22" }, { fecha: "2026-09-23" }, { fecha: "2026-09-24" },
    { fecha: "2026-09-25" }] };
const resultadosBackend = [semanaConSabado, semanaSinSabadoReal];

assert.equal(semanaSinSabado(semanaConSabado, resultadosBackend, AHORA), false,
  "semana con sábado activo no se marca");
assert.equal(semanaSinSabado(semanaSinSabadoReal, resultadosBackend, AHORA), true,
  "semana Detalle sin fecha de sábado en detalle_dias, con sin_clase>0, entre-semana completo y hermana con sábado: sí se marca");

// Materia que sencillamente NUNCA da clase el sábado (ninguna semana de la materia
// muestra un sábado activo): no se marca, aunque sin_clase sea > 0 por otro motivo
// (ej. un feriado entre semana) -- evita el falso positivo de "materia sin sábado
// programado" vs "sábado programado que no ocurrió".
const materiaSinSabadoNunca = { semana: "2026-03-02", materia: "JavaScript", nivel: "Detalle",
  cuadre: { roster: 100, medibles: 90, sin_dato: 0, pendientes: 0, sin_clase: 10 },
  detalle_dias: [{ fecha: "2026-03-03" }, { fecha: "2026-03-04" }] };
assert.equal(semanaSinSabado(materiaSinSabadoNunca, [materiaSinSabadoNunca], AHORA), false,
  "sin ninguna hermana con sábado activo, no se adivina");

// sin_clase == 0: nadie del roster quedó fuera por sábado, no se marca aunque falte
// la fecha de sábado en detalle_dias (ej. semana con sábado pero cero roster asignado).
const sinClaseCero = { ...semanaSinSabadoReal, cuadre: { ...semanaSinSabadoReal.cuadre, sin_clase: 0 } };
assert.equal(semanaSinSabado(sinClaseCero, [semanaConSabado, sinClaseCero], AHORA), false,
  "sin_clase=0 no se marca aunque falte el sábado en detalle_dias");

// Nivel "Solo semanal" (roster reconstruido, como el 2026-08-24 real): detalle_dias es
// null y cuadre.sin_clase queda forzado a 0 en el backend -- sin señal, no se adivina
// (verificado contra Supabase real: aviso no distingue este caso de una semana normal).
const semanaReconstruida = { semana: "2026-08-24", materia: "JavaScript", nivel: "Solo semanal",
  cuadre: { roster: 743, medibles: 743, sin_dato: 0, pendientes: 0, sin_clase: 0 },
  detalle_dias: null };
assert.equal(semanaSinSabado(semanaReconstruida, [semanaReconstruida], AHORA), false,
  "nivel Solo semanal sin señal por día: no se marca, no se adivina");

// Nivel "Sin dato": tampoco se marca.
const sinDato = { semana: "2026-06-01", materia: "Backend", nivel: "Sin dato",
  cuadre: { roster: 0, medibles: 0, sin_dato: 0, pendientes: 0, sin_clase: 0 }, detalle_dias: null };
assert.equal(semanaSinSabado(sinDato, [sinDato], AHORA), false, "nivel Sin dato no se marca");

// Semana EN CURSO (falso positivo real hallado 2026-09-29 contra Supabase: la semana
// 2026-09-28 -- roster=720, sin_clase=720, detalle_dias=[] porque todavía no ha ocurrido
// NINGÚN día de la semana, ni siquiera los de entre semana). Con "ahora" todavía dentro
// de esa semana (antes de que termine su sábado) NO se marca, aunque técnicamente no
// haya ninguna fecha de sábado en detalle_dias -- sencillamente aún no ha pasado.
const semanaEnCurso = { semana: "2026-09-28", materia: "Backend", nivel: "Detalle",
  cuadre: { roster: 720, medibles: 0, sin_dato: 0, pendientes: 0, sin_clase: 720 },
  detalle_dias: [] };
assert.equal(semanaSinSabado(semanaEnCurso, [semanaConSabado, semanaSinSabadoReal, semanaEnCurso], AHORA), false,
  "semana en curso (su sábado todavía no ocurre) no se marca aunque detalle_dias esté vacío");
// La misma semana, evaluada una vez que su sábado ya cerró (2026-10-05 en adelante):
// sigue sin marcarse porque le faltan TODOS los días entre semana frente a la hermana de
// referencia (0 de 4) -- es cobertura perdida, no "sábado sin clase".
const despuesDeCerrar = new Date("2026-10-06T12:00:00-05:00");
assert.equal(semanaSinSabado(semanaEnCurso, [semanaConSabado, semanaSinSabadoReal, semanaEnCurso], despuesDeCerrar), false,
  "sin ningún día entre semana capturado, aunque el sábado ya cerró, es cobertura perdida, no confirmación de sábado sin clase");

// Cobertura incompleta por OTRO motivo (falso positivo: a la cuenta de soporte se le
// perdió la captura del viernes Y el sábado, pero el sábado sí tuvo clase). Con menos
// días entre semana que la hermana de referencia (3 de 4), no se marca.
const coberturaIncompleta = { semana: "2026-09-21", materia: "Backend", nivel: "Detalle",
  cuadre: { roster: 726, medibles: 200, sin_dato: 0, pendientes: 0, sin_clase: 526 },
  detalle_dias: [{ fecha: "2026-09-22" }, { fecha: "2026-09-23" }, { fecha: "2026-09-24" }] };
assert.equal(semanaSinSabado(coberturaIncompleta, [semanaConSabado, coberturaIncompleta], despuesDeCerrar), false,
  "menos días entre semana que la hermana de referencia: cobertura perdida, no se marca");

// sabado_excluido del backend (migración 078, 2026-09-29): si la fila ya lo trae, se usa
// directo y ya no depende del heurístico -- cubre el caso real que el heurístico NO podía
// (2026-08-24, nivel "Solo semanal") y también puede desactivar un falso positivo si el
// backend concluye algo distinto al heurístico local.
assert.equal(semanaSinSabado({ ...semanaReconstruida, sabado_excluido: true }, [semanaReconstruida], AHORA),
  true, "el campo del backend cubre Solo semanal, donde el heurístico no tiene señal");
assert.equal(semanaSinSabado({ ...semanaSinSabadoReal, sabado_excluido: false }, resultadosBackend, AHORA),
  false, "el campo del backend manda incluso si el heurístico local diría true");

console.log("RESUMEN: tests=franja-tipo casos=18 estado=verde");
