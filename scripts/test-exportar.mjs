import assert from "node:assert/strict";
import { construirCsv } from "../lib/exportar.mjs";

const fila = { semana: "2026-09-14", materia: "Backend", nivel: "Detalle", poblacion: 726,
  asistieron: 541, nunca: 185, porcentaje_retencion: 74.52, porcentaje_nunca: 25.48,
  clases_capturadas: 14, clases_programadas: 14, porcentaje_cobertura: 100 };
const summary = construirCsv(fila, "Resumen");
assert.equal(summary.contenido.charCodeAt(0), 0xFEFF, "CSV con BOM UTF-8 para Excel");
assert.equal(summary.contenido.slice(1).split("\r\n")[0],
  '"semana","materia","nivel","poblacion","asistieron","nunca","porcentaje_retencion","porcentaje_nunca","clases_capturadas","clases_programadas","porcentaje_cobertura","captura_completa","aviso","fuente_cifras"');
assert.match(summary.contenido, /"2026-09-14","Backend","Detalle"/);
assert.match(summary.contenido, /"captura completa",""/);
const incompleta = construirCsv({ ...fila, captura_completa: false, aviso: "4 franjas ZL" }, "Resumen");
assert.match(incompleta.contenido, /"captura incompleta","4 franjas ZL"/);
assert.equal(summary.archivo, "resumen");
assert.doesNotMatch(summary.contenido, /nombre|correo|cedula|persona/i);
assert.throws(() => construirCsv(fila, "Asistencia por horario"), RangeError);
// Inyeccion de formulas: el agregado lleva strings libres (materia, aviso); los numeros (incl. negativos) no se tocan.
const inyectado = construirCsv({ ...fila, materia: '=HYPERLINK("http://x","y")', aviso: "@SUM(A1)", porcentaje_retencion: -5.5 }, "Resumen");
assert.match(inyectado.contenido, /"'=HYPERLINK\(""http:\/\/x"",""y""\)"/);
assert.match(inyectado.contenido, /"'@SUM\(A1\)"/);
assert.match(inyectado.contenido, /,"-5.5",/, "numero negativo legitimo intacto");
console.log("RESUMEN: tests_exportacion=5 csv=solo_agregado nominal=rechazado estado=verde");
