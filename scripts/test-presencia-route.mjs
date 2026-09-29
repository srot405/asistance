import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const lecturas = [];
const fixture = { semana: "2026-09-14", slot_id: "backend-martes-18", fecha: "2026-09-15", horario_texto: "Martes 18:00",
  medible: 50, conteos: { presente: 30, entro_y_salio: 12, nunca_entro: 8 }, sin_evidencia: 0 };
const source = await readFile(new URL("../app/api/presencia/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) =>
    request.headers.get("authorization") === "Bearer fixture-token" ? { email: "test-only" } :
      NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerPresenciaClase")) return {
    SEMANAS_DETALLE: new Set(["2026-09-14", "2026-09-21"]),
    leerPresenciaClase: async (semana, franja) => { lecturas.push({ semana, franja }); return fixture; },
  };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });

const denied = await exports.GET(new Request("http://local/api/presencia?semana=2026-09-14&franja=backend-martes-18"));
assert.equal(denied.status, 401);
assert.equal(lecturas.length, 0);

const headers = { Authorization: "Bearer fixture-token" };
const malaSemana = await exports.GET(new Request("http://local/api/presencia?semana=14-09-2026&franja=x", { headers }));
assert.equal(malaSemana.status, 400);

const noDetalle = await exports.GET(new Request("http://local/api/presencia?semana=2026-08-31&franja=x", { headers }));
assert.equal(noDetalle.status, 400, "una semana Solo semanal/Sin dato no tiene presencia por clase");
assert.match((await noDetalle.json()).error, /nivel distinto de Detalle/);

const sinFranja = await exports.GET(new Request("http://local/api/presencia?semana=2026-09-14", { headers }));
assert.equal(sinFranja.status, 400, "falta franja");
assert.match((await sinFranja.json()).error, /Falta la franja/);

const allowed = await exports.GET(new Request(
  "http://local/api/presencia?semana=2026-09-14&franja=backend-martes-18", { headers }));
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get("cache-control"), "private, no-store");
assert.deepEqual(JSON.parse(await allowed.text()), fixture);
assert.equal(lecturas[0].semana, "2026-09-14");
assert.equal(lecturas[0].franja, "backend-martes-18");

const serialized = JSON.stringify(fixture);
for (const forbidden of ["nombre", "persona_id", "correo", "cedula"])
  assert.equal(serialized.includes(`"${forbidden}"`), false, `/api/presencia sin ${forbidden}`);

console.log("RESUMEN: presencia=solo_agregados auth=401_sin_token nivel_invalido=400 sin_franja=400 pii=ausente estado=verde");
