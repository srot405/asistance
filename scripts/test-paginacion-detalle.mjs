import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/detalleCalculo.mjs";
import * as reporte from "../lib/reporteSemana.mjs";

// Regresion TOC-91: PostgREST corta a 1000 filas; cargarBase debe paginar con orden estable.
const source = await readFile(new URL("../lib/servidor/leerDetalleSemana.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const N = 2500;
const datos = {
  asist_roster: Array.from({ length: 5 }, (_, i) => ({ persona_id: `p${i}`, nombre: `N${i}`, ciudad: "C", slot_id: "s1" })),
  asist_franjas: [{ slot_id: "s1", fecha: "2026-09-29", cuenta_zoom: "x" }],
  asist_sesiones: [{ sesion_id: "z1", slot_id: "s1", fecha: "2026-09-29", entradas_totales: N, estado_captura: "capturada" }],
  asist_entradas: Array.from({ length: N }, (_, i) => ({ persona_id: `e${i}`, sesion_id: "z1" })),
  asist_celda_semana: [],
  asist_semana_resumen: [{ nivel: "Detalle", captura_completa: true }],
  asist_semanas: [{ congelada_en: "2026-09-28T12:00:00Z", notas: "" }],
};
const ordenes = [];
const require = (name) => {
  if (name === "server-only") return {};
  if (name.endsWith("/detalleCalculo.mjs")) return calculo;
  if (name.endsWith("/reporteSemana.mjs")) return reporte;
  if (name.endsWith("/detalle-demo.mjs")) return { DETALLE_DEMO_BASE: {} };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/supabase")) return { supabaseServidor: () => ({ from: (t) => {
    const c = { select: () => c, eq: () => c, order: (col) => { ordenes.push([t, col]); return c; }, limit: () => c,
      range: async (a, b) => ({ data: datos[t].slice(a, b + 1), error: null }),
      then: (ok) => ok({ data: datos[t].slice(0, 1000), error: null }) };
    return c; } }) };
  throw new Error(`Import no previsto: ${name}`);
};
const exports = {};
vm.runInNewContext(compiled, { exports, require, console });
const base = await exports.cargarBase("2026-09-28");
assert.equal(base.entradaFechaPorPersona.size, N, "las 2500 entradas llegan completas, no 1000");
assert.ok(ordenes.some(([t, c]) => t === "asist_entradas" && c === "sesion_id"), "orden estable en paginacion");
const rep = await exports.leerReporteSemana("2026-09-28");
assert.equal(rep.filas.length, 5);
console.log("RESUMEN: paginacion=2500_filas_completas orden=estable estado=verde");
