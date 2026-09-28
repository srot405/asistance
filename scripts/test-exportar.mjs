import assert from "node:assert/strict";
import { construirCsv } from "../lib/exportar.mjs";

const demo = {
  por_franja: [{ fecha: "2026-09-15", slot_id: "backend-martes-18", roster: 2, entro: 1, aOtra: 1, falto: 0 }],
  franjas_con_clase: [{ slot_id: "backend-martes-18" }, { slot_id: "backend-miercoles-18" }],
  participantes: [{ nombre: "Nombre de prueba", franja: "backend-martes-18", estado_semana: "SI",
    estado_por_franja: { "backend-martes-18": "V", "backend-miercoles-18": "N" } }],
};
const summary = construirCsv(demo, "Resumen");
assert.equal(summary.contenido.split("\r\n")[0], '"fecha","franja","roster","entro","a_otra","falto"');
assert.equal(summary.archivo, "resumen");
const attendance = construirCsv(demo, "Asistencia por horario");
assert.equal(attendance.contenido.split("\r\n")[0], '"nombre","franja","estado_semanal","backend-martes-18","backend-miercoles-18"');
assert.match(attendance.contenido, /"V","N"/);
assert.equal(construirCsv(demo, "Asistencia por horario", true).contenido.includes("Nombre de prueba"), false);
assert.match(construirCsv(demo, "Asistencia por horario", true).contenido, /Participante 001/);
assert.throws(() => construirCsv(demo, "ZOOM-LIMIT"), RangeError);
console.log("RESUMEN: tests_exportacion=5 estado=verde");
