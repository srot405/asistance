import assert from "node:assert/strict";
import { construirBase } from "../lib/detalleCalculo.mjs";
import { construirReporteSemana, construirCsvReporte } from "../lib/reporteSemana.mjs";

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
const r = construirReporteSemana("2026-09-28", base, { captura_completa: false, nivel: "Detalle" });
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
assert.match(lineas[1], /captura incompleta; roster=5; medible=2; fuera_dato=1; pendiente=1; sin_clase=1; cuadre=OK/);
assert.equal(lineas.filter((l) => l.startsWith('"FRANJA_SIN_DATO"')).length, 2);
assert.match(csv.contenido, /"Pérez, Ana ""la mejor"""/, "tildes, comas y comillas escapadas");
assert.equal(lineas.filter((l) => l.startsWith('"PERSONA"')).length, 5);
assert.doesNotMatch(csv.contenido, /"Zeta ZL","Cali","b-sabado-zl","2026-10-03","ZL","NO"/);

// Semana completa: sin franjas sin dato ni NO?.
const base2 = construirBase([roster[0]], [franjas[0]], [sesiones[0]], [{ persona_id: "1", sesion_id: "s1" }], [celdas[0]]);
const r2 = construirReporteSemana("2026-09-14", base2, { captura_completa: true });
assert.equal(r2.completa, true);
assert.match(construirCsvReporte(r2).contenido, /captura completa;/);
console.log("RESUMEN: reporte_semana=ok incompleta=declarada zl_p_no_convertidos=0 cuadre=ok bom=ok estado=verde");
