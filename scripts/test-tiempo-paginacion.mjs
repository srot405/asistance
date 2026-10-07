import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/tiempoCalculo.mjs";
import * as roles from "../lib/rolesCalculo.mjs";
import * as demo from "../lib/tiempo-demo.mjs";

// Carga leerTiempo.ts con un Supabase simulado que registra consultas. `datos[tabla]` = filas; `fallos[tabla]` = error a devolver.
export async function cargarLector(datos, fallos = {}) {
  const source = await readFile(new URL("../lib/servidor/leerTiempo.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const consultas = [];
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
    if (name.endsWith("/tiempo-demo.mjs")) return demo;
    if (name.endsWith("/tiempoCalculo.mjs")) return calculo;
    if (name.endsWith("/rolesCalculo.mjs")) return roles;
    if (name.endsWith("/supabase")) return { supabaseServidor: () => ({ from: (tabla) => {
      const q = { tabla, columnas: "", ordenes: [], filtros: [], rangos: [] };
      consultas.push(q);
      const c = {
        select: (cols) => { q.columnas = cols; return c; },
        eq: (col, val) => { q.filtros.push([col, val]); return c; },
        order: (col) => { q.ordenes.push(col); return c; },
        limit: () => c,
        range: async (a, b) => {
          q.rangos.push([a, b]);
          if (fallos[tabla]) return { data: null, error: fallos[tabla] };
          return { data: (datos[tabla] ?? []).slice(a, b + 1), error: null };
        },
        then: (ok) => ok(fallos[tabla] ? { data: null, error: fallos[tabla] } : { data: (datos[tabla] ?? []).slice(0, 1), error: null }),
      };
      return c; } }) };
    throw new Error(`Import no previsto: ${name}`);
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, console, Date });
  return { lector: exports, consultas };
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("test-tiempo-paginacion.mjs")) {
  const N = 2500;
  const datos = { asist_tiempo_persona_semana: Array.from({ length: N }, (_, i) => ({ persona_id: `p${i}` })) };
  const { lector, consultas } = await cargarLector(datos);
  const filas = await lector.tablaTiempo("asist_tiempo_persona_semana", "persona_id", "2099-01-05", ["persona_id"]);
  assert.equal(filas.length, N, "2500 filas = 3 paginas, sin truncar a 1000");
  const rangos = consultas.flatMap((c) => c.rangos);   // cada pagina es una consulta nueva
  const q = { ordenes: consultas.flatMap((c) => c.ordenes), filtros: consultas[0].filtros };
  assert.equal(JSON.stringify(rangos), JSON.stringify([[0, 999], [1000, 1999], [2000, 2999]]), "pide range(0,999), (1000,1999)... y para cuando el lote < 1000");
  assert.ok(q.ordenes.includes("persona_id"), "orden estable invocado");
  assert.equal(JSON.stringify(q.filtros), JSON.stringify([["semana", "2099-01-05"]]));
  // exactamente 1000 filas => pide una pagina mas (puede haber mas) y para al recibir lote vacio
  const mil = await cargarLector({ t: Array.from({ length: 1000 }, (_, i) => ({ i })) });
  assert.equal((await mil.lector.tablaTiempo("t", "i", null, ["i"])).length, 1000);
  assert.equal(mil.consultas.flatMap((c) => c.rangos).length, 2);
  assert.equal(mil.consultas[0].filtros.length, 0, "sin semana no filtra");
  console.log("RESUMEN: tiempo_paginacion=3_paginas_2500_filas orden=estable parada=lote_menor_1000 estado=verde");
}
