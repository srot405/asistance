import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const lecturas = [];
const fixture = { semana: "2026-09-14", nivel: "Detalle", ciudades: ["Bogotá"], franjas: [], cuentas: [],
  filtro: {}, resumen: { poblacion: 10, asistieron: 7, nunca: 3, porcentaje_retencion: 70, porcentaje_nunca: 30 },
  porDia: [], porClase: [] };
const source = await readFile(new URL("../app/api/detalle/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) =>
    request.headers.get("authorization") === "Bearer fixture-token" ? { email: "test-only" } :
      NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerDetalleSemana")) return {
    semanaTieneDetalle: async (s) => { if (s === "2026-01-01") throw new Error("red caida: secreto-interno"); return ["2026-09-14", "2026-09-21"].includes(s); },
    leerDetalleSemana: async (semana, filtro) => { lecturas.push({ semana, filtro }); return fixture; },
  };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });

const denied = await exports.GET(new Request("http://local/api/detalle?semana=2026-09-14"));
assert.equal(denied.status, 401);
assert.equal(lecturas.length, 0);

const headers = { Authorization: "Bearer fixture-token" };
const malaSemana = await exports.GET(new Request("http://local/api/detalle?semana=14-09-2026", { headers }));
assert.equal(malaSemana.status, 400);

const noDetalle = await exports.GET(new Request("http://local/api/detalle?semana=2026-08-31", { headers }));
assert.equal(noDetalle.status, 400, "una semana Solo semanal/Sin dato no tiene ruta de detalle");
assert.match((await noDetalle.json()).error, /nivel distinto de Detalle/);

const caida = await exports.GET(new Request("http://local/api/detalle?semana=2026-01-01", { headers }));
assert.equal(caida.status, 503, "error de red en semanaTieneDetalle -> JSON 503, no 500 HTML");
assert.equal(caida.headers.get("content-type"), "application/json");
assert.deepEqual(await caida.json(), { error: "No disponible" }, "sin filtrar detalles internos");

const allowed = await exports.GET(new Request("http://local/api/detalle?semana=2026-09-14&ciudad=Bogot%C3%A1", { headers }));
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get("cache-control"), "private, no-store");
assert.deepEqual(JSON.parse(await allowed.text()), fixture);
// lecturas[0].filtro se construye dentro del contexto vm (otro realm): comparar
// propiedad por propiedad evita el falso negativo de deepStrictEqual entre
// prototipos de dos realms distintos aunque la forma sea idéntica.
assert.equal(lecturas[0].semana, "2026-09-14");
assert.equal(lecturas[0].filtro.ciudad, "Bogotá");
assert.equal(lecturas[0].filtro.franja, undefined);
assert.equal(lecturas[0].filtro.cuenta, undefined);

const serialized = JSON.stringify(fixture);
for (const forbidden of ["nombre", "persona_id", "correo", "cedula"])
  assert.equal(serialized.includes(`"${forbidden}"`), false, `/api/detalle sin ${forbidden}`);

console.log("RESUMEN: detalle=solo_agregados auth=401_sin_token nivel_invalido=400 pii=ausente estado=verde");
