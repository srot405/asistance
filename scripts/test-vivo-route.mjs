import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/vivoCalculo.mjs";

// Ruta /api/vivo + lector con Supabase simulado: auth, 503 sin detalles, egress (llamadas y filas). Sin PII.
class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
async function compilar(ruta, require) {
  const src = await readFile(new URL(ruta, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require, console, Date, Promise, Map, Set, Number, Math, JSON, Response, URL }, {});
  return exports;
}

const SAB = "2026-10-03";
const COT = (hhmm) => Date.parse(`${SAB}T${hhmm}:00-05:00`);
const franjas = [
  { slot_id: "backend-sábado-08-uno", dia: "sábado", fecha: SAB, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 50 },
  { slot_id: "backend-sábado-10", dia: "sábado", fecha: SAB, hora_inicio: 10, hora_fin: 12, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 52 },
];
const correos = Array.from({ length: 10 }, (_, i) => `estudiante${i + 1}@ejemplo.test`);
let nextId = 100;
function fila(evento, correo, hhmm, uuid = "u1") { return { id: nextId++, evento, correo, nombre: null, hora_ms: COT(hhmm), uuid, curso: "Backend: APIs y Base de Datos" }; }

function montar({ eventos, falla = null }) {
  const tablas = {
    asist_semanas: [{ semana: "2026-09-28" }], asist_franjas: franjas, asist_roster: correos.map((c) => ({ correo_norm: c })),
    zoom_reuniones_activas: [{ uuid: "u1", host: "comunicaciones", topic: "Backend: APIs y Base de Datos", actualizado_en: new Date(COT("08:00")).toISOString() }],
    zoom_live_log: eventos,
  };
  const log = [];
  const sb = { from: (t) => {
    const q = { t, filtros: [], rango: null };
    const api = {
      select: () => api, eq: (c, v) => (q.filtros.push([c, v]), api), in: (c, v) => (q.filtros.push([c, v]), api), gt: (c, v) => (q.filtros.push([c, v]), api),
      gte: (c, v) => (q.filtros.push([c, v]), api), or: () => api, order: () => api, limit: () => api,
      range: async (a, b) => {
        log.push({ t, gt: q.filtros.find((f) => f[0] === "id" && typeof f[1] === "number")?.[1] });
        if (falla === t) return { data: null, error: { message: "secreto-interno: boom" } };
        let rows = tablas[t] ?? [];
        const gt = q.filtros.find((f) => f[0] === "id")?.[1];
        if (t === "zoom_live_log" && gt != null) rows = rows.filter((r) => r.id > gt);
        if (t === "asist_semanas") rows = rows;
        const out = rows.slice(a, b + 1);
        log[log.length - 1].filas = out.length;
        return { data: out, error: null };
      },
      then: (ok) => { // consultas sin range (asist_semanas .limit(1))
        log.push({ t, filas: 1 });
        return ok(falla === t ? { data: null, error: { message: "secreto-interno: boom" } } : { data: (tablas[t] ?? []).slice(0, 1), error: null });
      },
    };
    return api; } };
  return { sb, log };
}

async function cargarLector(sim) {
  return compilar("../lib/servidor/leerVivo.ts", (n) => {
    if (n === "server-only") return {};
    if (n.endsWith("/vivoCalculo.mjs")) return calculo;
    if (n.endsWith("/supabase")) return { supabaseServidor: () => sim.sb };
    throw new Error(`Import no previsto: ${n}`);
  });
}

// ---- egress: sin clase (domingo) = 0 lecturas de zoom_live_log
{
  const sim = montar({ eventos: [] });
  const l = await cargarLector(sim);
  const r = await l.leerVivo(Date.parse("2026-10-04T12:00:00-05:00"));
  assert.equal(r.clases.length, 0);
  assert.equal(sim.log.filter((x) => x.t === "zoom_live_log" || x.t === "zoom_reuniones_activas" || x.t === "asist_roster").length, 0, "sin clase: nada de zoom ni roster");
}
// ---- fuera de ventana el mismo dia (07:00): solo franja, 0 lecturas de zoom_live_log
{
  const sim = montar({ eventos: [fila("joined", correos[0], "07:40")] });
  const l = await cargarLector(sim);
  const r = await l.leerVivo(COT("07:15"));
  assert.equal(sim.log.filter((x) => x.t === "zoom_live_log").length, 0);
  assert.equal(r.clases[0].estado, "proxima");
}
// ---- clase abierta: lectura incremental + cache compartido
{
  const evs = [fila("joined", correos[0], "08:01"), fila("joined", correos[1], "08:02"), fila("joined", "ext@ejemplo.test", "08:03")];
  const sim = montar({ eventos: evs });
  const l = await cargarLector(sim);
  const t0 = COT("08:10");
  const a = await l.leerVivo(t0);
  assert.deepEqual([a.clases[0].estado, a.clases[0].roster_maximo, a.clases[0].desconocidos_maximo], ["abierta", 2, 1]);
  const lecturas = () => sim.log.filter((x) => x.t === "zoom_live_log");
  assert.equal(lecturas().length, 1); assert.equal(lecturas()[0].filas, 3, "primera lectura: 3 filas");
  const antes = sim.log.length;
  await Promise.all([l.leerVivo(t0 + 5000), l.leerVivo(t0 + 10000), l.leerVivo(t0 + 19000)]);
  assert.equal(sim.log.length, antes, "visitantes dentro del TTL no tocan Supabase");
  // dos eventos nuevos: la siguiente lectura pide id > cursor (con solape) y trae solo lo nuevo
  evs.push(fila("joined", correos[2], "08:11"), fila("left", correos[0], "08:12"));
  const b = await l.leerVivo(COT("08:13"));
  assert.deepEqual([b.clases[0].roster_maximo, b.clases[0].roster_ahora_aprox, b.clases[0].eventos], [3, 2, 5]);
  const ult = lecturas().at(-1);
  assert.ok(ult.gt >= evs[2].id - 25 - 1 && ult.filas <= 2 + 25, `incremental: gt=${ult.gt} filas=${ult.filas}`);
  assert.equal(ult.gt, evs[2].id - 25, "pide id > ultimo leido menos el solape (25)");
  // tablas de base (roster, franjas) se leen una vez dentro del TTL de base
  assert.equal(sim.log.filter((x) => x.t === "asist_roster").length, 1);
  assert.equal(sim.log.filter((x) => x.t === "asist_franjas").length, 1);
  assert.ok(!/ejemplo|@/.test(JSON.stringify(b)), "sin PII en la respuesta");
}
// ---- fallo: no se cachea y se reintenta
{
  const sim = montar({ eventos: [], falla: "zoom_live_log" });
  const l = await cargarLector(sim);
  await assert.rejects(() => l.leerVivo(COT("08:10")));
  const n = sim.log.filter((x) => x.t === "zoom_live_log").length;
  await assert.rejects(() => l.leerVivo(COT("08:10") + 1000));
  assert.ok(sim.log.filter((x) => x.t === "zoom_live_log").length > n, "el fallo no se cachea");
}

// ---- ruta: 401 sin lecturas, 200 solo conteos, 503 sin detalles
let llamadas = 0; let modo = "ok";
const ruta = await compilar("../app/api/vivo/route.ts", (n) => {
  if (n === "next/server") return { NextResponse };
  if (n.endsWith("/acceso")) return { exigirAcceso: async (req) => req.headers.get("authorization") === "Bearer fixture-token" ? { email: "test-only" } : NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (n.endsWith("/leerVivo")) return { leerVivo: async () => { llamadas += 1; if (modo === "falla") throw new Error("postgres: relacion secreta xyz"); return { disponible: true, clases: [], aviso_general: null }; } };
  throw new Error(`Import no previsto: ${n}`);
});
const sin = await ruta.GET(new Request("http://local/api/vivo"));
assert.equal(sin.status, 401); assert.equal(llamadas, 0, "401 antes de toda lectura");
const conParam = await ruta.GET(new Request("http://local/api/vivo?nombres=1&demo=1"));
assert.equal(conParam.status, 401, "ni demo ni parametros saltan el login");
const ok = await ruta.GET(new Request("http://local/api/vivo?nombres=1", { headers: { authorization: "Bearer fixture-token" } }));
assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, no-store"); assert.equal(llamadas, 1);
modo = "falla";
const mal = await ruta.GET(new Request("http://local/api/vivo", { headers: { authorization: "Bearer fixture-token" } }));
assert.equal(mal.status, 503);
assert.deepEqual(await mal.json(), { error: "No disponible" });
const fuente = await readFile(new URL("../app/api/vivo/route.ts", import.meta.url), "utf8");
assert.ok(!/searchParams/.test(fuente), "la ruta no lee parametros");
console.log("RESUMEN: vivo_route 401=sin_lecturas 503=sin_detalles egress=sin_clase_0_lecturas_zoom,incremental,cache_TTL estado=verde");
