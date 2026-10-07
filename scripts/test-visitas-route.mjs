// /api/visitas (TOC-147): auth obligatoria, validaciones, degradado y errores sin detalles internos. Nominal: solo tras exigirAcceso.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { armarVisitas } from "../lib/visitasCalculo.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const d = TIEMPO_DEMO["2026-09-14"];
const respuesta = armarVisitas({ semana: "2026-09-14", filas: d.personas, franjas: d.franjas, clases: d.clases, noIdentificados: d.noIdentificados });
const llamadas = [];
const source = await readFile(new URL("../app/api/visitas/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) => request.headers.get("authorization") === "Bearer fixture-token"
    ? { email: "test-only" } : NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerDetalleSemana")) return { semanaTieneDetalle: async (s) => {
    if (s === "2026-01-01") throw new Error("red caida: secreto-interno");
    return ["2026-09-14", "2026-09-21", "2026-09-28"].includes(s); } };
  if (name.endsWith("/leerVisitas")) return { leerVisitasSemana: async (semana, filtro) => {
    llamadas.push({ semana, filtro });
    if (semana === "2026-09-21") return { disponible: false, motivo: "sin_tablas" };
    if (semana === "2026-09-28") throw new Error("postgres: relacion secreta xyz");
    return respuesta; } };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
const url = (q) => `http://local/api/visitas?${q}`;
const headers = { Authorization: "Bearer fixture-token" };

const denegado = await exports.GET(new Request(url("semana=2026-09-14")));
assert.equal(denegado.status, 401);
assert.equal(llamadas.length, 0, "sin Bearer no se toca el lector");
assert.equal((await exports.GET(new Request(url("semana=2026-09-14&demo=1")))).status, 401, "demo=1 sin MODO_DEMO exige auth");
assert.equal((await exports.GET(new Request(url("semana=14-09-2026"), { headers }))).status, 400);
const noDetalle = await exports.GET(new Request(url("semana=2026-08-31"), { headers }));
assert.equal(noDetalle.status, 400); assert.match((await noDetalle.json()).error, /nivel distinto de Detalle/);
const caida = await exports.GET(new Request(url("semana=2026-01-01"), { headers }));
assert.equal(caida.status, 503); assert.equal(JSON.stringify(await caida.json()), JSON.stringify({ error: "No disponible" }));

const ok = await exports.GET(new Request(url("semana=2026-09-14&ciudad=Ciudad%20X&franja=a&cuenta=c1"), { headers }));
assert.equal(ok.status, 200);
assert.equal(ok.headers.get("cache-control"), "private, no-store");
assert.equal(JSON.stringify(llamadas[0]), JSON.stringify({ semana: "2026-09-14", filtro: { ciudad: "Ciudad X", franja: "a", cuenta: "c1" } }));
const cuerpo = await ok.json();
assert.equal(cuerpo.visitas.length, respuesta.visitas.length);
// la matriz del cuerpo no trae ni persona_id ni correo; los nombres viven SOLO en `visitas`
const sinVisitas = JSON.stringify({ ...cuerpo, visitas: [] });
for (const prohibido of ["persona_id", "correo", "cedula"]) assert.equal(sinVisitas.includes(`"${prohibido}"`), false, `sin la clave ${prohibido}`);
assert.equal(JSON.stringify(cuerpo).includes("persona_id"), false);

const sinTablas = await exports.GET(new Request(url("semana=2026-09-21"), { headers }));
assert.equal(sinTablas.status, 200); assert.equal((await sinTablas.json()).disponible, false, "sin tablas: 200 disponible:false");
const falla = await exports.GET(new Request(url("semana=2026-09-28"), { headers }));
assert.equal(falla.status, 503); assert.equal(JSON.stringify(await falla.json()), JSON.stringify({ error: "No disponible" }), "sin filtrar detalles internos");

console.log("RESUMEN: visitas_route auth=401 semana_invalida=400 nivel=400 caida=503 sin_tablas=200 sin_persona_id=ok estado=verde");
