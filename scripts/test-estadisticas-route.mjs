// /api/estadisticas y lib/servidor/leerEstadisticas.ts (TOC-150): auth obligatoria, semana validada, pagina SIEMPRE (PostgREST corta en
// 1000 filas), solo las dos vistas sin PII, cache de servidor, degradado sin vistas y errores sin detalles internos.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

const consultas = [];
// 2300 filas sinteticas de nivel 'ciudad' (semanas inventadas) para forzar 3 paginas; sin ningun campo de persona.
const SERIE = Array.from({ length: 2300 }, (_, i) => ({ semana: `2030-01-${String((i % 28) + 1).padStart(2, "0")}`, nivel: "ciudad", ciudad: `C${i}`, dia: null,
  materia: "M", suprimido: false, roster: 10, entraron_a_su_clase: 5, fueron_a_otra: 1, no_aparecieron: 3, no_medibles: 1, visitas_recibidas: 0 }));
const estado = { falla: null, tablaAusente: false };
const supabase = { supabaseServidor: () => ({ from: (tabla) => {
  const q = { tabla, filtros: [], rangos: [], columnas: "" }; consultas.push(q);
  const c = { select: (cols) => { q.columnas = cols; return c; }, eq: (col, v) => { q.filtros.push([col, v]); return c; }, order: () => c,
    range: async (a, b) => {
      q.rangos.push([a, b]);
      if (estado.falla) return { data: null, error: new Error("postgres: relacion secreta xyz") };
      if (estado.tablaAusente) return { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.v_asist_corte'" } };
      const base = tabla === "v_asist_corte_nivel" ? (q.filtros.some(([col]) => col === "semana") ? [{ semana: "2026-09-14", nivel: "semana", ciudad: null, dia: null, materia: "M", suprimido: false, roster: 5 }] : SERIE) : [];
      return { data: base.slice(a, b + 1), error: null };
    } };
  return c; } }) };
const exports = {}; const modulos = {};
const req = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name === "server-only") return {};
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/estadisticas-demo.mjs")) return { ESTADISTICAS_DEMO: {}, SERIE_DEMO: [], construirCortesDemo: () => ({}), MATERIA_DEMO: {} };
  if (name.endsWith("/supabase")) return supabase;
  if (name === "./leerTiempo") return { NO_DISPONIBLE: { disponible: false, motivo: "sin_tablas" },
    esTablaAusente: (e) => e?.code === "PGRST205", tablaTiempo: modulos.tablaTiempo };
  if (name.endsWith("/servidor/acceso")) return { exigirAcceso: async (r) => r.headers.get("authorization") === "Bearer ok"
    ? { email: "u@ejemplo.test", acceso: { nominal: "ninguno" } } : NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerEstadisticas")) return modulos.lector;
  throw new Error(`Import no previsto: ${name}`);
};
// tablaTiempo REAL (paginada) sobre el supabase simulado, extraida de leerTiempo.ts
{
  const src = await readFile(new URL("../lib/servidor/leerTiempo.ts", import.meta.url), "utf8");
  const ini = src.indexOf("const PAGINA = 1000;"), fin = src.indexOf("const COLUMNAS_CLASE");
  const trozo = src.slice(ini, fin);
  const js = ts.transpileModule(`import { supabaseServidor } from "./supabase";\n${trozo}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ex = {}; vm.runInNewContext(js, { exports: ex, require: () => supabase, console }); modulos.tablaTiempo = ex.tablaTiempo;
}
const cargar = async (ruta, ex) => vm.runInNewContext(await compilar(ruta), { exports: ex, require: req, Response, URL, Request, console });
const lector = {}; await cargar("../lib/servidor/leerEstadisticas.ts", lector); modulos.lector = lector;
await cargar("../app/api/estadisticas/route.ts", exports);
const pedir = (q, auth = true) => exports.GET(new Request(`http://local/api/estadisticas?${q}`, { headers: auth ? { Authorization: "Bearer ok" } : {} }));

assert.equal((await pedir("semana=2026-09-14", false)).status, 401);
assert.equal(consultas.length, 0, "sin Bearer no se toca la base");
assert.equal((await pedir("semana=14-09-2026")).status, 400);
assert.equal((await pedir("")).status, 400);

const ok = await pedir("semana=2026-09-14");
assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, max-age=30");
const cuerpo = await ok.json();
assert.equal(cuerpo.disponible, true); assert.equal(cuerpo.serie.length, 2300, "pagina las 3 paginas de la serie");
assert.deepEqual([...new Set(consultas.map((c) => c.tabla))].sort(), ["v_asist_corte", "v_asist_corte_nivel"], "solo vistas sin PII");
const serieQ = consultas.filter((c) => c.tabla === "v_asist_corte_nivel" && !c.filtros.some(([col]) => col === "semana"));
assert.deepEqual(serieQ.map((c) => c.rangos[0][0]), [0, 1000, 2000]); assert.ok(serieQ.every((c) => c.filtros.some(([col, v]) => col === "nivel" && v === "ciudad")), "serie = solo nivel ciudad");
for (const q of consultas) for (const prohibido of ["persona_id", "nombre", "correo", "cedula"]) assert.equal(q.columnas.includes(prohibido), false, `sin ${prohibido}`);
assert.equal(/persona_id|"nombre"|correo|cedula/.test(JSON.stringify(cuerpo)), false);

// cache de servidor: la segunda lectura no vuelve a la base
const n = consultas.length; await pedir("semana=2026-09-14"); assert.equal(consultas.length, n, "cache 60 s");
// disponible para cualquier rol: la ruta no pide el rol (acceso.nominal ninguno igual recibe 200)
assert.equal((await pedir("semana=2026-09-14")).status, 200);

// degradado y errores sin detalles; el fallo no se cachea
lector.vaciarCacheEstadisticas(); estado.tablaAusente = true;
const sinVistas = await pedir("semana=2026-09-21"); assert.equal(sinVistas.status, 200);
assert.deepEqual(await sinVistas.json(), { disponible: false, motivo: "sin_vistas" });
lector.vaciarCacheEstadisticas(); estado.tablaAusente = false; estado.falla = true;
const caida = await pedir("semana=2026-09-28"); assert.equal(caida.status, 503);
assert.equal(JSON.stringify(await caida.json()), JSON.stringify({ error: "No disponible" })); assert.equal(caida.headers.get("cache-control"), "private, no-store");
estado.falla = false; assert.equal((await pedir("semana=2026-09-28")).status, 200, "tras un fallo se relee (no se cachea el error)");

console.log("RESUMEN: estadisticas_route auth=401 semana=400 paginacion=3x1000 solo_vistas_sin_pii=ok cache=60s sin_vistas=200_disponible_false caida=503_sin_detalles estado=verde");
