import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { armarSerieTiempo, armarTiempoSemana, normalizarResumenPersonas } from "../lib/tiempoCalculo.mjs";
import { TIEMPO_DEMO_SERIE } from "../lib/tiempo-demo.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const d = TIEMPO_DEMO["2026-09-14"];
const respuesta = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas,
  info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila) } });
const serie = { disponible: true, semanas: armarSerieTiempo(TIEMPO_DEMO_SERIE) };

async function cargar(ruta, lector) {
  const source = await readFile(new URL(ruta, import.meta.url), "utf8");
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
    if (name.endsWith("/leerTiempo")) return lector;
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
  return exports;
}

const llamadas = [];
const lector = {
  leerTiempoSemana: async (semana, filtro) => {
    llamadas.push({ semana, filtro });
    if (semana === "2026-09-21") return { disponible: false, motivo: "sin_tablas" };
    if (semana === "2026-09-28") throw new Error("postgres: relacion secreta xyz");
    return respuesta;
  },
  leerTiempoSemanas: async () => serie,
};
const ruta = await cargar("../app/api/tiempo/route.ts", lector);
const url = (q) => `http://local/api/tiempo?${q}`;
const headers = { Authorization: "Bearer fixture-token" };

// 401 sin Bearer y NO se llama al lector
const denegado = await ruta.GET(new Request(url("semana=2026-09-14")));
assert.equal(denegado.status, 401);
assert.equal(llamadas.length, 0, "sin Bearer no se toca el lector");
// ?demo=1 sin MODO_DEMO tambien exige auth
assert.equal((await ruta.GET(new Request(url("semana=2026-09-14&demo=1")))).status, 401, "demo=1 sin MODO_DEMO exige auth");
// semana invalida / no Detalle / caida
assert.equal((await ruta.GET(new Request(url("semana=14-09-2026"), { headers }))).status, 400);
const noDetalle = await ruta.GET(new Request(url("semana=2026-08-31"), { headers }));
assert.equal(noDetalle.status, 400);
assert.match((await noDetalle.json()).error, /nivel distinto de Detalle/);
const caida = await ruta.GET(new Request(url("semana=2026-01-01"), { headers }));
assert.equal(caida.status, 503);
assert.equal(caida.headers.get("content-type"), "application/json");
assert.deepEqual(await caida.json(), { error: "No disponible" }, "sin filtrar detalles internos");
// fallo de lectura de las tablas de tiempo => 503 JSON sin detalle (la pantalla degrada a "Tiempo aun no disponible")
const falla = await ruta.GET(new Request(url("semana=2026-09-28"), { headers }));
assert.equal(falla.status, 503);
const cuerpoFalla = await falla.text();
assert.deepEqual(JSON.parse(cuerpoFalla), { error: "No disponible" });
assert.doesNotMatch(cuerpoFalla, /secreta|postgres|xyz/);
// tablas ausentes => 200 { disponible:false }
const sinTablas = await ruta.GET(new Request(url("semana=2026-09-21"), { headers }));
assert.equal(sinTablas.status, 200);
assert.deepEqual(await sinTablas.json(), { disponible: false, motivo: "sin_tablas" });
// 200 con datos y filtros pasados al lector
const ok = await ruta.GET(new Request(url("semana=2026-09-14&ciudad=Bogot%C3%A1&cuenta=soporte"), { headers }));
assert.equal(ok.status, 200);
assert.equal(ok.headers.get("cache-control"), "private, no-store");
const texto = await ok.text();
assert.deepEqual(JSON.parse(texto).semana, "2026-09-14");
assert.equal(JSON.stringify(llamadas.at(-1).filtro), JSON.stringify({ ciudad: "Bogotá", franja: null, cuenta: "soporte" }));

// La respuesta serializada NO contiene PII
const prohibidos = ["nombre", "persona_id", "correo", "cedula", "documento", "telefono"];
function recorrer(valor, ruta = "$") {
  if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor)) {
    assert.equal(prohibidos.includes(k), false, `clave PII ${k} en ${ruta}`);
    recorrer(v, `${ruta}.${k}`);
  } else if (typeof valor === "string") {
    assert.equal(valor.includes("@"), false, `@ en ${ruta}`);
    assert.equal(/Persona Demo|Estudiante \d/.test(valor), false, `nombre en ${ruta}`);
  }
}
recorrer(JSON.parse(texto));

// ---- /api/tiempo-semanas ----
const rutaSem = await cargar("../app/api/tiempo-semanas/route.ts", lector);
assert.equal((await rutaSem.GET(new Request("http://local/api/tiempo-semanas"))).status, 401);
const s200 = await rutaSem.GET(new Request("http://local/api/tiempo-semanas", { headers }));
assert.equal(s200.status, 200);
assert.equal(s200.headers.get("cache-control"), "private, no-store");
const sJson = await s200.json();
assert.equal(sJson.disponible, true);
assert.ok(sJson.semanas.length >= 3);
recorrer(sJson);
const rutaSemOff = await cargar("../app/api/tiempo-semanas/route.ts", { leerTiempoSemanas: async () => ({ disponible: false, motivo: "sin_tablas" }) });
const off = await rutaSemOff.GET(new Request("http://local/api/tiempo-semanas", { headers }));
assert.equal(off.status, 200);
assert.deepEqual(await off.json(), { disponible: false, motivo: "sin_tablas" });
const rutaSemFalla = await cargar("../app/api/tiempo-semanas/route.ts", { leerTiempoSemanas: async () => { throw new Error("secreto-interno"); } });
const f503 = await rutaSemFalla.GET(new Request("http://local/api/tiempo-semanas", { headers }));
assert.equal(f503.status, 503);
assert.deepEqual(await f503.json(), { error: "No disponible" });

// exigirAcceso presente en el codigo fuente de ambas rutas (analisis estatico)
for (const f of ["../app/api/tiempo/route.ts", "../app/api/tiempo-semanas/route.ts", "../app/api/exportar-nominal/route.ts"])
  assert.match(await readFile(new URL(f, import.meta.url), "utf8"), /exigirAcceso\(request\)/, `${f} exige acceso`);
console.log("RESUMEN: tiempo_route=ok auth=401_sin_token pii=ausente degradado=200_o_503_sin_detalle demo_sin_MODO_DEMO=401 estado=verde");
