import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// semanaTieneDetalle debe salir de asist_semana_resumen (nivel Detalle), no de una lista fija.
async function cargar({ modoDemo, filas, error = null }) {
  const source = await readFile(new URL("../lib/servidor/leerDetalleSemana.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const consultas = [];
  const exports = {};
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/detalleCalculo.mjs") || name.endsWith("/reporteSemana.mjs")) return {};
    if (name.endsWith("/detalle-demo.mjs")) return { DETALLE_DEMO_BASE: { "2026-09-14": {} } };
    if (name.endsWith("/demo.js")) return { MODO_DEMO: modoDemo };
    if (name.endsWith("/supabase")) return { supabaseServidor: () => ({ from: (t) => {
      const q = { t, eq: [] };
      const cadena = { select: () => cadena, eq: (c, v) => { q.eq.push([c, v]); return cadena; },
        limit: async () => { consultas.push(q);
          return { data: error ? null : filas.filter((f) => q.eq.every(([c, v]) => f[c] === v)), error }; } };
      return cadena; } }) };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, console });
  return { fn: exports.semanaTieneDetalle, consultas };
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
console.log("RESUMEN: semana_detalle=derivada_de_asist_semana_resumen demo=llaves_fixture");
