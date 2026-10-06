import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/detalleCalculo.mjs";
import * as reporteLib from "../lib/reporteSemana.mjs";

// semanaTieneDetalle debe salir de asist_semana_resumen (nivel Detalle), no de una lista fija.
async function cargar({ modoDemo, filas, error = null, real = false, tablas = {} }) {
  const source = await readFile(new URL("../lib/servidor/leerDetalleSemana.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const consultas = [];
  const exports = {};
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/detalleCalculo.mjs")) return real ? calculo : {};
    if (name.endsWith("/reporteSemana.mjs")) return real ? reporteLib : {};
    if (name.endsWith("/detalle-demo.mjs")) return { DETALLE_DEMO_BASE: { "2026-09-14": {} } };
    if (name.endsWith("/demo.js")) return { MODO_DEMO: modoDemo };
    if (name.endsWith("/supabase")) return { supabaseServidor: () => ({ from: (t) => {
      const q = { t, eq: [] };
      const cadena = { select: () => cadena, eq: (c, v) => { q.eq.push([c, v]); return cadena; }, order: () => cadena,
        range: async (d, h) => { const f = (tablas[t] ?? []).filter((x) => q.eq.every(([c, v]) => x[c] === v)); return { data: f.slice(d, h + 1), error: null }; },
        limit: async () => { consultas.push(q);
          return { data: error ? null : filas.filter((f) => q.eq.every(([c, v]) => f[c] === v)), error }; } };
      return cadena; } }) };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, console });
  return { fn: exports.semanaTieneDetalle, nivel: exports.nivelSemana, reporte: exports.leerReporteSemana, consultas };
}

const filas = [
  { semana: "2026-09-28", nivel: "Detalle" },
  { semana: "2026-10-05", nivel: "Detalle" }, // semana nueva: aparece sin tocar código
  { semana: "2026-08-31", nivel: "Solo semanal" },
];
const real = await cargar({ modoDemo: false, filas });
assert.equal(await real.fn("2026-10-05"), true);
assert.equal(await real.fn("2026-09-28"), true);
assert.equal(await real.fn("2026-08-31"), false, "Solo semanal no es Detalle");
assert.equal(await real.fn("2026-10-12"), false, "sin fila de resumen aún");
assert.equal(real.consultas[0].t, "asist_semana_resumen");

const conError = await cargar({ modoDemo: false, filas: [], error: new Error("x") });
await assert.rejects(() => conError.fn("2026-09-28"));

const demo = await cargar({ modoDemo: true, filas: [] });
assert.equal(await demo.fn("2026-09-14"), true);
assert.equal(await demo.fn("2026-10-05"), false);
// nivelSemana / leerReporteSemana contra el modulo REAL (calculo y reporte reales, solo Supabase simulado).
const sem = "2026-10-19";
const tablas = {
  asist_roster: [{ semana: sem, persona_id: "1", nombre: "Ana", ciudad: "Cali", slot_id: "x-lunes" }],
  asist_franjas: [{ semana: sem, slot_id: "x-lunes", fecha: sem, cuenta_zoom: "z" }],
  asist_sesiones: [{ semana: sem, sesion_id: "s1", slot_id: "x-lunes", fecha: sem, entradas_totales: 1, estado_captura: "capturada" }],
  asist_entradas: [{ semana: sem, persona_id: "1", sesion_id: "s1" }],
  asist_celda_semana: [{ semana: sem, persona_id: "1", estado: "SI" }],
};
const resumenes = [{ semana: "2026-08-31", nivel: "Solo semanal" }, { semana: "2026-09-28", nivel: "Detalle" }];
const srv = await cargar({ modoDemo: false, filas: resumenes, real: true, tablas });
assert.equal(await srv.nivel(sem), null, "semana en curso: sin fila de resumen");
assert.equal(await srv.nivel("2026-08-31"), "Solo semanal");
const rep = await srv.reporte(sem);
assert.ok(rep, "roster congelado + sin resumen: hay reporte");
assert.equal(rep.sinResumen, true);
assert.match(reporteLib.construirCsvReporte(rep).contenido, /resumen no generado/);
assert.equal(await srv.reporte("2026-10-12"), null, "sin roster: null (la ruta responde 404)");
const rapido = await cargar({ modoDemo: false, filas: [{ semana: sem, nivel: "Detalle", poblacion: 1, asistieron: 1, nunca: 0,
  cuadre: { roster: 1, medibles: 1, sin_dato: 0, sin_clase: 0, pendientes: 0 }, captura_completa: true }], real: true, tablas });
assert.equal((await rapido.reporte(sem)).comparacion.estado, "OK", "resumen real comparado contra el recalculo");
const sinRed = await cargar({ modoDemo: false, filas: [], error: new Error("x"), real: true, tablas });
await assert.rejects(() => sinRed.nivel(sem));
console.log("RESUMEN: semana_detalle=derivada_de_asist_semana_resumen demo=llaves_fixture");
