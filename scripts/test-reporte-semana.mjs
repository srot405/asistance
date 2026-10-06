import assert from "node:assert/strict";
import { construirBase } from "../lib/detalleCalculo.mjs";
import { neutralizarFormula } from "../lib/csvSeguro.mjs";
import { construirReporteSemana, construirCsvReporte, LEYENDA } from "../lib/reporteSemana.mjs";

// Semana incompleta sintetica: 1 franja capturada, 1 ZL, 1 por ocurrir; roster con tildes, comas y comillas.
const franjas = [
  { slot_id: "a-martes", fecha: "2026-09-29", cuenta_zoom: "x" },
  { slot_id: "b-sabado-zl", fecha: "2026-10-03", cuenta_zoom: "x" },
  { slot_id: "c-futura", fecha: "2026-10-04", cuenta_zoom: "x" },
];
const sesiones = [
  { sesion_id: "s1", slot_id: "a-martes", fecha: "2026-09-29", entradas_totales: 2, estado_captura: "capturada" },
  { sesion_id: "s2", slot_id: "b-sabado-zl", fecha: "2026-10-03", entradas_totales: 0, estado_captura: "zoom_limit_pendiente" },
  { sesion_id: "s3", slot_id: "c-futura", fecha: "2026-10-04", entradas_totales: 0, estado_captura: "por_ocurrir" },
];
const roster = [
  { persona_id: "1", nombre: "Pérez, Ana \"la mejor\"", ciudad: "Bogotá", slot_id: "a-martes" },
  { persona_id: "2", nombre: "Muñoz Núñez", ciudad: "Cali", slot_id: "a-martes" },
  { persona_id: "3", nombre: "Zeta ZL", ciudad: "Cali", slot_id: "b-sabado-zl" },
  { persona_id: "4", nombre: "Pendiente P", ciudad: "Cali", slot_id: "c-futura" },
  { persona_id: "5", nombre: "Sin Franja", ciudad: "Cali", slot_id: null },
];
const celdas = [
  { persona_id: "1", estado: "SI" }, { persona_id: "2", estado: "NO?" },
  { persona_id: "3", estado: "ZL" }, { persona_id: "4", estado: "P" },
];
const base = construirBase(roster, franjas, sesiones, [{ persona_id: "1", sesion_id: "s1" }], celdas);
const resumenOk = { captura_completa: false, nivel: "Detalle", poblacion: 2, asistieron: 1, nunca: 1,
  cuadre: { roster: 5, medibles: 2, sin_dato: 1, sin_clase: 1, pendientes: 1 } };
const r = construirReporteSemana("2026-09-28", base, resumenOk, { congelada_en: "2026-09-28T13:05:00Z" });
assert.equal(r.completa, false);
assert.equal(r.filas.length, roster.length, "incluye TODO el roster");
assert.deepEqual(r.cuadre, { roster: 5, medible: 2, fueraDato: 1, pendiente: 1, sinClase: 1 });
assert.ok(r.cuadra);
assert.deepEqual(r.sinDato.map((s) => s.franja), ["b-sabado-zl", "c-futura"]);
const dia = (n) => r.filas.find((f) => f.nombre.startsWith(n)).dia;
assert.equal(dia("Zeta"), "ZL", "ZL nunca se vuelve NO");
assert.equal(dia("Pendiente"), "P");
assert.equal(dia("Muñoz"), "NO?");
assert.equal(dia("Sin Franja"), "sin clase");
assert.equal(dia("Pérez"), "SI");

const csv = construirCsvReporte(r);
assert.equal(csv.contenido.charCodeAt(0), 0xFEFF, "BOM UTF-8");
assert.equal(csv.archivo, "reporte_captura_incompleta");
const lineas = csv.contenido.slice(1).split("\r\n");
assert.equal(lineas[0], '"tipo_fila","semana","nombre","ciudad","franja","fecha","estado_semana","estado_dia","detalle"');
assert.match(lineas[1], /captura incompleta; Seguimiento: 5 estudiantes \(congelado el 28\/09\); roster=5; medible=2; fuera_dato=1; pendiente=1; sin_clase=1; cuadre=OK/);
assert.equal(lineas.filter((l) => l.startsWith('"FRANJA_SIN_DATO"')).length, 2);
assert.match(csv.contenido, /"Pérez, Ana ""la mejor"""/, "tildes, comas y comillas escapadas");
assert.equal(lineas.filter((l) => l.startsWith('"PERSONA"')).length, 5);
assert.doesNotMatch(csv.contenido, /"Zeta ZL","Cali","b-sabado-zl","2026-10-03","ZL","NO"/);

// Cuadre contra asist_semana_resumen: discrepancia declarada (no bloquea), sin resumen declarado, sin dato comparable.
const rDisc = construirReporteSemana("2026-09-28", base, { ...resumenOk, poblacion: 3, cuadre: { ...resumenOk.cuadre, sin_dato: 0 } });
assert.equal(rDisc.comparacion.estado, "DISCREPA");
const txtDisc = construirCsvReporte(rDisc).contenido;
assert.match(txtDisc, /cuadre=DISCREPA\(poblacion: resumen=3 reporte=2 \| no_medibles: resumen=2 reporte=3\)/);
assert.doesNotMatch(txtDisc, /cuadre=OK/);
assert.equal(rDisc.filas.length, 5, "la discrepancia no bloquea la descarga");
const rSin = construirReporteSemana("2026-10-05", base, null);
assert.match(construirCsvReporte(rSin).contenido, /resumen no generado; /);
assert.match(construirCsvReporte(rSin).contenido, /cuadre=sin_comparar/);
assert.doesNotMatch(construirCsvReporte(rSin).contenido, /cuadre=OK/, "sin resumen no se afirma OK");

// Sesiones multiples en un slot: capturada con entradas gana; si no, la peor; se declara.
const sesMulti = [...sesiones, { sesion_id: "s4", slot_id: "a-martes", fecha: "2026-09-29", entradas_totales: 0, estado_captura: "zoom_limit_pendiente" },
  { sesion_id: "s5", slot_id: "b-sabado-zl", fecha: "2026-10-03", entradas_totales: 0, estado_captura: "capturada" }];
const rMulti = construirReporteSemana("2026-09-28", construirBase(roster, franjas, sesMulti, [{ persona_id: "1", sesion_id: "s1" }], celdas), resumenOk);
assert.ok(!rMulti.sinDato.some((x) => x.franja === "a-martes"), "capturada con entradas gana sobre ZL en el mismo slot");
const zl = rMulti.sinDato.find((x) => x.franja === "b-sabado-zl");
assert.equal(zl.estado, "zoom_limit_pendiente", "capturada SIN entradas no tapa a ZL: gana la peor");
assert.match(zl.motivo, /sesiones multiples/);
assert.deepEqual(rMulti.multiples.map((m) => m.franja).sort(), ["a-martes", "b-sabado-zl"]);
assert.match(construirCsvReporte(rMulti).contenido, /sesiones multiples=a-martes\(capturada\+zoom_limit_pendiente\)/);

// Inyeccion de formulas en nombres y ciudad; numeros/fechas/"-" intactos.
for (const [entrada, esperado] of [["=HYPERLINK(\"x\")", "'=HYPERLINK(\"x\")"], ["+573001112233", "'+573001112233"], ["@x", "'@x"],
  ["-1", "'-1"], ["  =1+1", "'  =1+1"], ["\tcmd", "'\tcmd"], ["\rcmd", "'\rcmd"], ["-", "-"], ["Ana -Pérez", "Ana -Pérez"],
  ["2026-09-28", "2026-09-28"], ["", ""], [-5.5, -5.5], [0, 0], [null, null]])
  assert.equal(neutralizarFormula(entrada), esperado, JSON.stringify(entrada));
const rInj = construirReporteSemana("2026-09-28", construirBase([{ persona_id: "9", nombre: "=HYPERLINK(\"http://x\")", ciudad: "+57 1", slot_id: "a-martes" },
  { persona_id: "8", nombre: "@x", ciudad: "-1", slot_id: "a-martes" }], franjas, sesiones, [], []), null);
const txtInj = construirCsvReporte(rInj).contenido;
assert.match(txtInj, /"PERSONA","2026-09-28","'=HYPERLINK\(""http:\/\/x""\)","'\+57 1"/);
assert.match(txtInj, /"PERSONA","2026-09-28","'@x","'-1"/);
assert.doesNotMatch(txtInj, /"PERSONA","2026-09-28","[=+@-]/, "ningun campo nombre/ciudad empieza con disparador");

// Semana completa: sin franjas sin dato ni NO?.
const base2 = construirBase([roster[0]], [franjas[0]], [sesiones[0]], [{ persona_id: "1", sesion_id: "s1" }], [celdas[0]]);
const r2 = construirReporteSemana("2026-09-14", base2, { captura_completa: true });
assert.equal(r2.completa, true);
assert.match(construirCsvReporte(r2).contenido, /captura completa;/);
console.log("RESUMEN: reporte_semana=ok incompleta=declarada zl_p_no_convertidos=0 cuadre=ok bom=ok estado=verde");

// TOC-131: dia declarado sin clase (sesion sin_clase, celda SC) queda fuera del denominador: ni ZL ni NO.
const frSC = [franjas[0], { slot_id: "d-sabado-sc", fecha: "2026-09-26", cuenta_zoom: "x" }];
const sesSC = [sesiones[0], { sesion_id: "s9", slot_id: "d-sabado-sc", fecha: "2026-09-26", entradas_totales: 0, estado_captura: "sin_clase" }];
const rosSC = [roster[0], { persona_id: "7", nombre: "Sabado Sinclase", ciudad: "Cali", slot_id: "d-sabado-sc" }];
const celSC = [{ persona_id: "1", estado: "SI" }, { persona_id: "7", estado: "SC" }];
const baseSC = construirBase(rosSC, frSC, sesSC, [{ persona_id: "1", sesion_id: "s1" }], celSC);
const rSC = construirReporteSemana("2026-09-21", baseSC, { captura_completa: true });
assert.equal(rSC.cuadre.sinClase, 1, "SC cuenta como sin clase");
assert.equal(rSC.cuadre.medible, 1, "SC fuera del denominador");
assert.equal(rSC.cuadre.fueraDato, 0, "SC no es ZL");
assert.equal(rSC.cuadre.roster, rSC.cuadre.medible + rSC.cuadre.sinClase, "cuadre con SC");
assert.equal(rSC.cuadra, true);
assert.equal(rSC.sinDato.length, 0, "sin_clase no es sesion sin dato");
assert.equal(rSC.completa, true, "semana completa pese a sin_clase");
assert.equal(rSC.filas.find((f) => f.nombre.startsWith("Sabado")).semanal, "sin clase");
assert.match(LEYENDA, /SC=/);
// Con entradas reales, una sesion sin_clase NO se oculta (el dia sigue activo).
const sesSC2 = [sesiones[0], { ...sesSC[1], entradas_totales: 3 }];
const baseSC2 = construirBase(rosSC, frSC, sesSC2, [{ persona_id: "1", sesion_id: "s1" }], [{ persona_id: "1", estado: "SI" }, { persona_id: "7", estado: "NO?" }]);
assert.equal(construirReporteSemana("2026-09-21", baseSC2, null).cuadre.medible, 2, "con entradas se mide");
console.log("RESUMEN: sin_clase=ok");
