import assert from "node:assert/strict";
import { construirCsv } from "../lib/exportar.mjs";

const fila = { semana: "2026-09-14", materia: "Backend", nivel: "Detalle", poblacion: 726,
  asistieron: 541, nunca: 185, porcentaje_retencion: 74.52, porcentaje_nunca: 25.48,
  clases_capturadas: 14, clases_programadas: 14, porcentaje_cobertura: 100 };
const summary = construirCsv(fila, "Resumen");
assert.equal(summary.contenido.split("\r\n")[0],
  '"semana","materia","nivel","poblacion","asistieron","nunca","porcentaje_retencion","porcentaje_nunca","clases_capturadas","clases_programadas","porcentaje_cobertura"');
assert.match(summary.contenido, /"2026-09-14","Backend","Detalle"/);
assert.equal(summary.archivo, "resumen");
assert.doesNotMatch(summary.contenido, /nombre|correo|cedula|persona/i);
assert.throws(() => construirCsv(fila, "Asistencia por horario"), RangeError);
console.log("RESUMEN: tests_exportacion=5 csv=solo_agregado nominal=rechazado estado=verde");
