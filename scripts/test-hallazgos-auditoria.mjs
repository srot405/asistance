// Hallazgos de la auditoria de V0/V1/V5 (TOC-146/147/151): (1) un fallo real de Supabase en el tiempo de Presencia ya no se disfraza de
// "sin dato" con 200; (4) estado_tiempo desconocido cuenta como sin_dato (total = suma de buckets); (8) nota de las dos fuentes en Presencia.
// (5) y (6) se prueban en test-confianza.mjs. Datos sinteticos.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as roles from "../lib/rolesCalculo.mjs";
import * as calculo from "../lib/tiempoCalculo.mjs";
import * as demo from "../lib/tiempo-demo.mjs";
import { armarVisitas } from "../lib/visitasCalculo.mjs";

const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

// ---- (1) leerTiempoPersonasClase: tabla ausente = degradado legitimo; cualquier otro fallo = excepcion ----
async function lector(errorDeLectura) {
  const supabase = { supabaseServidor: () => ({ from: () => { const c = { select: () => c, eq: () => c, order: () => c,
    range: async () => ({ data: null, error: errorDeLectura }) }; return c; } }) };
  const req = (n) => n === "server-only" ? {} : n.endsWith("/demo.js") ? { MODO_DEMO: false } : n.endsWith("/tiempo-demo.mjs") ? demo
    : n.endsWith("/tiempoCalculo.mjs") ? calculo : n.endsWith("/rolesCalculo.mjs") ? roles : n.endsWith("/supabase") ? supabase : (() => { throw new Error(n); })();
  const exports = {}; vm.runInNewContext(await compilar("../lib/servidor/leerTiempo.ts"), { exports, require: req, console, Date });
  return exports;
}
{
  const ausente = await lector({ code: "PGRST205", message: "Could not find the table 'public.v_asist_tiempo_persona'" });
  const m = await ausente.leerTiempoPersonasClase("2026-09-14", "a");
  assert.equal(m.size, 0, "sin las tablas de tiempo: mapa vacio (Presencia declara «sin dato de tiempo», como siempre)");
  for (const e of [{ message: "fetch failed" }, { code: "42501", message: "permission denied for view secreto" }, new Error("boom")]) {
    const roto = await lector(e);
    await assert.rejects(() => roto.leerTiempoPersonasClase("2026-09-14", "a"), undefined, "un fallo real se propaga (la ruta responde 503), no un 200 enganoso");
  }
}
// la ruta de presencia responde 503 (no 200 ni 500 HTML) cuando la lectura lanza
{
  class NextResponse extends Response { static json(b, i = {}) { return new NextResponse(JSON.stringify(b), { ...i, headers: { "Content-Type": "application/json", ...i.headers } }); } }
  const exports = {};
  const req = (n) => n === "next/server" ? { NextResponse } : n.endsWith("/demo.js") ? { MODO_DEMO: false } : n.endsWith("/acceso") ? { exigirAcceso: async () => ({ email: "x@ejemplo.test" }) }
    : n.endsWith("/leerPresenciaClase") ? { semanaTieneDetalle: async () => true, leerPresenciaClase: async () => { throw new Error("secreto-interno"); } } : (() => { throw new Error(n); })();
  vm.runInNewContext(await compilar("../app/api/presencia/route.ts"), { exports, require: req, URL, Request, Response, console });
  const r = await exports.GET(new Request("http://local/api/presencia?semana=2026-09-14&franja=a"));
  assert.equal(r.status, 503); assert.equal(JSON.stringify(await r.json()), JSON.stringify({ error: "No disponible" }));
}

// ---- (4) visitas: un estado desconocido no cae fuera de los buckets ----
{
  const franjas = [{ slot_id: "a", fecha: "2026-09-15", cuenta_zoom: "c", horario_texto: "A" }, { slot_id: "b", fecha: "2026-09-16", cuenta_zoom: "c", horario_texto: "B" }];
  const v = (nombre, estado) => ({ sesion_id: `2026-09-16|b|${nombre}`, franja_tiempo: "b", fecha: "2026-09-16", nombre, ciudad: "Cali", franja_propia: "a", estado_tiempo: estado, pct_tiempo: 55, es_visita: true });
  const r = armarVisitas({ semana: "2026-09-14", franjas, filas: [v("Uno", "cumple"), v("Dos", "rojo_tiempo"), v("Tres", "sin_dato_tiempo"), v("Cuatro", "pendiente"), v("Cinco", "estado_de_una_migracion_futura")] });
  const { total, cumplen, rojo, sin_dato, pendientes } = r.resumen;
  assert.equal(total, 5); assert.equal(cumplen + rojo + sin_dato + pendientes, total, "total = suma de buckets");
  assert.equal(sin_dato, 2, "el desconocido cuenta como sin_dato");
  const raro = r.visitas.find((x) => x.visitante === "Cinco");
  assert.equal(raro.veredicto, "sin_dato_tiempo"); assert.equal(raro.pct_tiempo, null, "y no muestra un % que nadie valido");
}

// ---- (8) Presencia explica sus dos fuentes ----
{
  const src = await readFile(new URL("../components/Presencia.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="presencia-fuentes"/); assert.match(src, /entradas registradas/); assert.doesNotMatch(src, /asist_entradas|asist_sesiones/, "sin nombres de tabla en pantalla"); assert.match(src, /API de Zoom/);
}
console.log("RESUMEN: hallazgos_auditoria tiempo_presencia=propaga_error(503) tabla_ausente=degradado visitas_desconocido=sin_dato total=suma_buckets nota_fuentes=ok estado=verde");
