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
  vm.runInNewContext(js, { exports, require, console, Date, Promise, Map, Set, Number, Math, JSON, Response, URL, setTimeout, clearTimeout }, {});
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

function montar({ eventos, falla = null, franjas: fr = franjas, roster = correos.map((c) => ({ correo_norm: c, slot_id: "backend-sábado-08-uno" })),
  activas = [{ uuid: "u1", activo: true, host: "comunicaciones", topic: "Backend: APIs y Base de Datos", actualizado_en: new Date(COT("08:00")).toISOString() }],
  fallaMeta = 0, registrantes = [] }) {
  const tablas = { asist_semanas: [{ semana: "2026-09-28" }], asist_franjas: fr, asist_roster: roster, zoom_reuniones_activas: activas, zoom_live_log: eventos,
    zoom_registrantes: registrantes };
  const log = [];
  let metaFallos = fallaMeta;
  const sb = { from: (t) => {
    const q = { t, filtros: [], rango: null, cols: "" };
    const api = {
      select: (c) => { q.cols = c; return api; }, eq: (c, v) => (q.filtros.push([c, v]), api), in: (c, v) => (q.filtros.push([c, v]), api), gt: (c, v) => (q.filtros.push([c, v]), api),
      gte: () => api, or: () => api, order: () => api, limit: () => api,
      range: async (a, b) => {
        const porUuid = q.filtros.find((f) => f[0] === "uuid" && Array.isArray(f[1]));
        log.push({ t, cols: q.cols, meta: Boolean(porUuid), gt: q.filtros.find((f) => f[0] === "id" && typeof f[1] === "number")?.[1] });
        if (falla === t) return { data: null, error: { message: "secreto-interno: boom" } };
        if (porUuid && metaFallos > 0) { metaFallos -= 1; log.at(-1).fallo = true; return { data: null, error: { message: "secreto-interno: meta" } }; }
        let rows = tablas[t] ?? [];
        for (const [c, val] of q.filtros) { // eq/in solo sobre columnas que las filas tienen (activo, uuid)
          if (rows.length && c in rows[0] && c !== "id") rows = rows.filter((r) => (Array.isArray(val) ? val.includes(r[c]) : r[c] === val));
        }
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
  assert.match(sim.log.find((x) => x.t === "asist_roster").cols, /slot_id/, "el roster se carga con slot_id");
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

// ---- (1) roster por franja a traves del lector: visitante de otra franja
{
  const roster = [...correos.slice(0, 4).map((c) => ({ correo_norm: c, slot_id: "backend-sábado-08-uno" })),
    ...correos.slice(4, 8).map((c) => ({ correo_norm: c, slot_id: "backend-sábado-10" }))];
  const sim = montar({ eventos: [fila("joined", correos[0], "08:01"), fila("joined", correos[5], "08:02"), fila("joined", correos[6], "08:03"), fila("joined", "ext@ejemplo.test", "08:04")], roster });
  const l = await cargarLector(sim);
  const c = (await l.leerVivo(COT("08:10"))).clases.find((x) => x.slot_id === "backend-sábado-08-uno");
  assert.deepEqual([c.roster_maximo, c.otra_franja_maximo, c.otra_franja_ahora_aprox, c.desconocidos_maximo], [1, 2, 2, 1]);
  assert.ok(c.roster_maximo <= c.roster_total);
}
// ---- (5)+(8) reloj y TTL de 30 s: actualizado_en = lectura real; hora_servidor = ahora; 20 s sigue cacheado, 31 s relee
{
  const sim = montar({ eventos: [fila("joined", correos[0], "08:01")] });
  const l = await cargarLector(sim);
  assert.equal(l.TTL_CACHE_VIVO_MS, 30_000);
  const t0 = COT("08:10");
  const a = await l.leerVivo(t0);
  assert.equal(a.actualizado_en, new Date(t0).toISOString());
  const n = sim.log.length;
  const b = await l.leerVivo(t0 + 20_000);
  assert.equal(sim.log.length, n, "a los 20 s sigue el cache (TTL 30 s)");
  assert.equal(b.actualizado_en, new Date(t0).toISOString(), "actualizado_en = ultima lectura real, no la hora de la respuesta");
  assert.equal(b.hora_servidor, new Date(t0 + 20_000).toISOString(), "hora_servidor = ahora");
  await l.leerVivo(t0 + 29_000); assert.equal(sim.log.length, n);
  const c = await l.leerVivo(t0 + 31_000);
  assert.ok(sim.log.length > n, "a los 31 s relee"); assert.equal(c.actualizado_en, new Date(t0 + 31_000).toISOString());
}
// ---- (2) instancia en frio despues de terminar: sin burbujas y sin leer zoom_live_log
{
  const sim = montar({ eventos: [fila("joined", correos[0], "08:01")] });
  const l = await cargarLector(sim);
  const r = await l.leerVivo(COT("13:00"));
  const c = r.clases.find((x) => x.slot_id === "backend-sábado-08-uno");
  assert.equal(c.estado, "terminada"); assert.equal(c.aviso, "Cifra final no disponible aquí; ver pestaña Presencia");
  assert.equal(c.roster_maximo, 0); assert.equal(c.sala_activa, false);
  assert.equal(sim.log.filter((x) => x.t === "zoom_live_log").length, 0, "frio fuera de ventana: 0 lecturas de eventos");
}
// ---- (3) ULTIMO refresco al cerrar la ventana: recoge lo llegado entre el ultimo sondeo y el cierre, una sola vez
{
  const una = [franjas[0]]; // 08:00-10:00, ventana 07:30-10:30
  const evs = [fila("joined", correos[0], "08:01")];
  const sim = montar({ eventos: evs, franjas: una });
  const l = await cargarLector(sim);
  const lecturas = () => sim.log.filter((x) => x.t === "zoom_live_log").length;
  await l.leerVivo(COT("08:10"));
  const ult = await l.leerVivo(COT("10:20")); // ultimo sondeo dentro de la ventana
  assert.equal(ult.clases[0].roster_maximo, 1);
  evs.push(fila("joined", correos[1], "10:25"), fila("left", correos[0], "10:29"));
  const antes = lecturas();
  assert.equal(l.estadoVivoParaPruebas().cerrado, false);
  const cierre = await l.leerVivo(COT("10:31")); // primera vez fuera de la ventana
  assert.equal(lecturas(), antes + 1, "un ultimo refresco");
  assert.deepEqual([cierre.clases[0].estado, cierre.clases[0].roster_maximo, cierre.clases[0].roster_ahora_aprox], ["terminada", 2, 1]);
  assert.equal(l.estadoVivoParaPruebas().cerrado, true, "estado cerrado");
  await l.leerVivo(COT("10:45")); await l.leerVivo(COT("11:30")); await l.leerVivo(COT("15:00"));
  assert.equal(lecturas(), antes + 1, "despues del cierre no se vuelve a leer");
}
// ---- (4) meta de salas perdida tras un fallo parcial: se reintenta y el cursor no avanza hasta resolverla
{
  const dosFr = [franjas[0], { ...franjas[0], slot_id: "backend-sábado-08-dos", cuenta_zoom: "jovenescreativos", roster_n: 52 }];
  const evs = [fila("joined", correos[0], "08:01", "u9"), fila("joined", correos[1], "08:02", "u9")];
  const activas = [{ uuid: "u9", activo: false, host: "jovenescreativos", topic: "Backend: APIs y Base de Datos", actualizado_en: null }];
  const roster = correos.map((c) => ({ correo_norm: c, slot_id: "backend-sábado-08-dos" }));
  const sim = montar({ eventos: evs, franjas: dosFr, activas, roster, fallaMeta: 1 });
  const l = await cargarLector(sim);
  const gts = () => sim.log.filter((x) => x.t === "zoom_live_log").map((x) => x.gt);
  const r1 = await l.leerVivo(COT("08:10")); // la consulta de meta falla UNA vez: no tumba la respuesta
  assert.equal(r1.disponible, true); assert.match(r1.aviso_general, /sin franja/, "sin host: ambigua entre uno y dos");
  assert.equal(l.estadoVivoParaPruebas().cursor, 0, "el cursor NO avanza mientras la meta esta pendiente");
  const r2 = await l.leerVivo(COT("08:12")); // reintenta: ahora resuelve
  assert.equal(r2.clases.find((x) => x.slot_id === "backend-sábado-08-dos").roster_maximo, 2, "la meta se recupero: host jovenescreativos -> franja dos");
  assert.equal(r2.aviso_general, null);
  assert.equal(l.estadoVivoParaPruebas().cursor, evs[1].id, "resuelta la meta, el cursor avanza");
  assert.equal(sim.log.filter((x) => x.meta).length, 2, "un reintento por refresco");
  await l.leerVivo(COT("08:14"));
  assert.equal(gts().at(-1), evs[1].id - 25, "y el siguiente refresco ya es incremental");
  assert.equal(sim.log.filter((x) => x.meta).length, 2, "con la meta resuelta no se vuelve a pedir");
}
{ // meta que nunca llega: maximo 3 intentos por sala, luego el cursor sigue (no se queda releyendo para siempre)
  const evs = [fila("joined", correos[0], "08:01", "u8")];
  const sim = montar({ eventos: evs, activas: [], fallaMeta: 99 });
  const l = await cargarLector(sim);
  for (const t of ["08:10", "08:12", "08:14", "08:16", "08:18"]) await l.leerVivo(COT(t));
  assert.equal(sim.log.filter((x) => x.meta).length, 3, "tope de 3 reintentos por sala");
  assert.equal(l.estadoVivoParaPruebas().cursor, evs[0].id, "agotados los reintentos el cursor avanza");
}

// ---- (9) identidad por cedula del registro de Zoom (fase 1.4): solo en ventana, 2 columnas, cache 5 min, fallo con aviso
{
  const roster = correos.slice(0, 4).map((c, i) => ({ persona_id: `00${2000 + i}`, correo_norm: c, slot_id: "backend-sábado-08-uno" }));
  const registrantes = [{ correo_norm: "alterno@ejemplo.test", cedula_digitos: "2001", fecha_sesion: SAB }];
  const sim = montar({ eventos: [fila("joined", correos[0], "08:01"), fila("joined", "alterno@ejemplo.test", "08:02"), fila("joined", "ext@ejemplo.test", "08:03")],
    roster, registrantes });
  const l = await cargarLector(sim);
  assert.equal(l.TTL_REGISTRO_MS, 5 * 60_000);
  await l.leerVivo(COT("07:15"));
  assert.equal(sim.log.filter((x) => x.t === "zoom_registrantes").length, 0, "fuera de ventana: no se lee el registro");
  const c = (await l.leerVivo(COT("08:10"))).clases.find((x) => x.slot_id === "backend-sábado-08-uno");
  assert.deepEqual([c.roster_maximo, c.desconocidos_maximo], [2, 1], "correo fuera del roster + cedula (con ceros en el roster) = roster");
  const reg = sim.log.filter((x) => x.t === "zoom_registrantes");
  assert.equal(reg.length, 1); assert.equal(reg[0].cols, "correo_norm,cedula_digitos", "solo dos columnas");
  assert.match(sim.log.find((x) => x.t === "asist_roster").cols, /persona_id/);
  await l.leerVivo(COT("08:12")); await l.leerVivo(COT("08:14"));
  assert.equal(sim.log.filter((x) => x.t === "zoom_registrantes").length, 1, "cache de 5 min");
  await l.leerVivo(COT("08:16"));
  assert.equal(sim.log.filter((x) => x.t === "zoom_registrantes").length, 2, "pasados 5 min se relee");
}
{ // si el registro falla, no tumba la respuesta: cuenta por correo y avisa
  const sim = montar({ eventos: [fila("joined", correos[0], "08:01")], falla: "zoom_registrantes" });
  const l = await cargarLector(sim);
  const r = await l.leerVivo(COT("08:10"));
  assert.equal(r.clases[0].roster_maximo, 1); assert.match(r.aviso_general, /registro de Zoom/);
  assert.ok(!/secreto-interno/.test(JSON.stringify(r)));
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
