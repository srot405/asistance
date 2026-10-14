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
  medible: 50, conteos: { presente: 30, parcial: 10, nunca_entro: 8, sin_dato: 2 } };
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
    // «2026-08-17» = semana «Solo semanal» reconstruida con detalle por persona; «2026-06-01» = sin detalle
    semanaConPersonas: async (s) => { if (s === "2026-01-01") throw new Error("red caida: secreto-interno"); return { ok: ["2026-09-14", "2026-09-21", "2026-08-17"].includes(s), reconstruida: s === "2026-08-17" }; },
    leerPresenciaClase: async (semana, franja) => { lecturas.push({ semana, franja }); return fixture; },
    listarFranjasPresencia: async () => [{ slot_id: "backend-martes-18", fecha: "2026-08-18", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00" }],
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

const noDetalle = await exports.GET(new Request("http://local/api/presencia?semana=2026-06-01&franja=x", { headers }));
assert.equal(noDetalle.status, 400, "una semana sin detalle por persona no tiene presencia");
assert.match((await noDetalle.json()).error, /no tiene presencia por persona/);
// 2026-10-14: semana reconstruida: se habilita (estado semanal por persona) y entrega su lista de clases
const recons = await exports.GET(new Request("http://local/api/presencia?semana=2026-08-17&franja=backend-martes-18", { headers }));
assert.equal(recons.status, 200, "semana reconstruida con detalle por persona: habilitada");
const lista = await exports.GET(new Request("http://local/api/presencia?semana=2026-08-17&listar=franjas", { headers }));
assert.equal(lista.status, 200); assert.deepEqual((await lista.json()).franjas.map((f) => f.slot_id), ["backend-martes-18"], "lista de clases para el selector");

const sinFranja = await exports.GET(new Request("http://local/api/presencia?semana=2026-09-14", { headers }));
assert.equal(sinFranja.status, 400, "falta franja");
assert.match((await sinFranja.json()).error, /Falta la franja/);

const caida = await exports.GET(new Request("http://local/api/presencia?semana=2026-01-01&franja=x", { headers }));
assert.equal(caida.status, 503, "error de red en la compuerta -> JSON 503, no 500 HTML");
assert.equal(caida.headers.get("content-type"), "application/json");
assert.deepEqual(await caida.json(), { error: "No disponible" }, "sin filtrar detalles internos");

const allowed = await exports.GET(new Request(
  "http://local/api/presencia?semana=2026-09-14&franja=backend-martes-18", { headers }));
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get("cache-control"), "private, no-store");
assert.deepEqual(JSON.parse(await allowed.text()), fixture);
assert.equal(lecturas.at(-1).semana, "2026-09-14");
assert.equal(lecturas.at(-1).franja, "backend-martes-18");

const serialized = JSON.stringify(fixture);
for (const forbidden of ["nombre", "persona_id", "correo", "cedula"])
  assert.equal(serialized.includes(`"${forbidden}"`), false, `/api/presencia sin ${forbidden}`);

console.log("RESUMEN: presencia=solo_agregados auth=401_sin_token nivel_invalido=400 sin_franja=400 pii=ausente estado=verde");
