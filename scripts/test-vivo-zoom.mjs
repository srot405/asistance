import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { armarRespuestaVivo, clasificarEventos, compactarEvento, conRegistro, indexarRegistroVivo, indexarRosterVivo, presentesDeClase } from "../lib/vivoCalculo.mjs";
import { armarListaVivo } from "../lib/vivoNominal.mjs";
import * as zoomPresentes from "../lib/zoomPresentes.mjs";

// TOC-153: conciliacion de «ahora en sala» con los participantes EN VIVO de Zoom. Sin red y con datos sinteticos (ejemplo.test,
// cedulas 1000000xx). Cubre: regla de presentes (sala de espera, dedupe por correo, bots = personal), conteos y lista nominal
// conciliados, cuando NO se concilia, y el lector lib/servidor/zoomEnVivo.ts (ruta por host, uuid doble-codificado, cache
// compartido, una lectura en vuelo, 429 con pausa, host caido, tope total, apagado sin variables).
const { presentesDeParticipantes, compactarPresentes } = zoomPresentes;
const SAB = "2026-10-03";
const COT = (hhmm) => Date.parse(`${SAB}T${hhmm}:00-05:00`);
const ISO = (hhmm) => new Date(COT(hhmm)).toISOString();
const correo = (i) => `estudiante${String(i).padStart(3, "0")}@ejemplo.test`;
const franjas = [
  { slot_id: "backend-sábado-08-uno", dia: "sábado", fecha: SAB, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 4 },
  { slot_id: "backend-sábado-10", dia: "sábado", fecha: SAB, hora_inicio: 10, hora_fin: 12, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 2 },
];
const roster = [
  ...[1, 2, 3, 4].map((i) => ({ persona_id: `10000000${i}`, correo_norm: correo(i), nombre: `Estudiante ${i}`, ciudad: "Bogotá", slot_id: "backend-sábado-08-uno" })),
  ...[5, 6].map((i) => ({ persona_id: `10000000${i}`, correo_norm: correo(i), nombre: `Estudiante ${i}`, ciudad: "Cali", slot_id: "backend-sábado-10" })),
];
// la persona 4 entra con un correo personal que no esta en el roster; el registro de Zoom lo enlaza por cedula
const registrantes = [{ correo_norm: "otro.correo@ejemplo.test", cedula_digitos: "0100000004", nombre: "Estudiante", apellido: "4" }];
let id = 1;
const ev = (evento, c, hhmm, nombre = null) => ({ id: id++, evento, correo: c, nombre, hora_ms: COT(hhmm), ms: COT(hhmm) });
const part = (email, user_name, status = "in_meeting", hhmm = "08:05") => ({ email, user_name, status, join_time: ISO(hhmm) });

// ---------- 1) presentes de Zoom
{
  const p = presentesDeParticipantes([
    part(correo(1), "Estudiante 1", "in_meeting", "08:10"), part(correo(1).toUpperCase(), "Est 1 (celular)", "in_meeting", "08:03"), // reentrada: 1
    part(correo(2), "Estudiante 2", "in_waiting_room"),                                       // sala de espera: no cuenta
    part("jovenescreativos@tocaunavida.org", "Monitor A"), part("jovenescreativos@tocaunavida.org", "Monitor B"), // personal: 2 personas
    part("", "Read.ai Meeting Notes"),                                                       // robot: personal
    part("", "iPhone"), part("", "iPhone"),                                                  // anonimos: cada uno cuenta
    part(correo(3), "Estudiante 3", "left"),
  ]);
  assert.equal(p.length, 6);
  const uno = p.find((x) => x.correo === correo(1));
  assert.equal(uno.join_ms, COT("08:03"), "se queda con la entrada mas temprana");
  assert.ok(!p.some((x) => x.correo === correo(2) || x.correo === correo(3)));
}

// ---------- 2) conteos (En vivo, solo hashes)
const identidad = conRegistro(indexarRosterVivo(roster), indexarRegistroVivo(registrantes));
{
  const eventos = [ev("joined", correo(1), "08:01"), ev("left", correo(1), "08:20"),   // reentrada de 1 perdida por el webhook
    ev("joined", correo(2), "08:02"), ev("left", correo(2), "08:40"),                  // 2 salio de verdad
    ev("joined", correo(3), "08:03")].map(compactarEvento);                           // 3 sigue
  const solo = clasificarEventos(eventos, identidad, COT("08:45"), "backend-sábado-08-uno");
  assert.deepEqual([solo.roster.ahora, solo.roster.maximo, solo.conciliado_zoom], [1, 3, false]);
  const zoom = compactarPresentes(presentesDeParticipantes([part(correo(1), "E1", "in_meeting", "08:30"), part(correo(3), "E3"),
    part("otro.correo@ejemplo.test", "Estudiante 4"),           // persona 4 por cedula del registro: roster, sin evento previo
    part(correo(5), "Estudiante 5"),                             // del roster de otra franja: colado
    part("fred@fireflies.ai", "Fireflies.ai Notetaker"),         // robot: personal
    part("", "iPhone"),                                          // anonimo: desconocido
    part(correo(2), "E2", "in_waiting_room")]));                  // sala de espera: no esta en clase
  const c = clasificarEventos(eventos, identidad, COT("08:45"), "backend-sábado-08-uno", zoom);
  assert.deepEqual([c.roster.ahora, c.roster.maximo], [3, 4], "roster: 1, 3 y 4 ahora; maximo suma a 4");
  assert.deepEqual([c.otra.ahora, c.personal.ahora, c.desconocidos.ahora], [1, 1, 1]);
  assert.equal(c.conciliado_zoom, true);
  // la misma persona con dos correos (roster + registro) no se cuenta dos veces
  const doble = clasificarEventos([ev("joined", correo(4), "08:01")].map(compactarEvento), identidad, COT("08:45"), "backend-sábado-08-uno",
    compactarPresentes([{ correo: "otro.correo@ejemplo.test", nombre: null, join_ms: COT("08:30") }]));
  assert.deepEqual([doble.roster.maximo, doble.roster.ahora], [1, 1]);
  // anonimos: los de Zoom ocupan primero a los del webhook
  const anon = clasificarEventos([ev("joined", null, "08:01", "iPhone"), ev("joined", null, "08:02", "iPhone")].map(compactarEvento), identidad,
    COT("08:45"), "backend-sábado-08-uno", compactarPresentes([{ correo: null, nombre: "iPhone", join_ms: null }]));
  assert.deepEqual([anon.desconocidos.maximo, anon.desconocidos.ahora], [2, 1]);
}

// ---------- 3) cuando NO se concilia
{
  const m = new Map([["u1", [1]]]);
  assert.equal(presentesDeClase([{ uuid: "u1", activo: true }], m, "terminada"), null, "clase terminada: Zoom ya no la tiene en vivo");
  assert.equal(presentesDeClase([{ uuid: "u1", activo: true }, { uuid: "u2", activo: true }], m, "abierta"), null, "falta una sala activa");
  assert.equal(presentesDeClase([{ uuid: "u1", activo: true }], null, "abierta"), null, "Zoom apagado o caido");
  assert.deepEqual(presentesDeClase([{ uuid: "u1", activo: true }, { uuid: "u0", activo: false }], m, "abierta"), [1]);
}

// ---------- 4) armarRespuestaVivo y armarListaVivo con Zoom
const topic = "Backend: APIs y Base de Datos";
const crudos = [ev("joined", correo(1), "08:01"), ev("left", correo(1), "08:20"), ev("joined", correo(2), "08:02")];
const presentes = presentesDeParticipantes([part(correo(1), "E1", "in_meeting", "08:30"), part(correo(2), "E2"), part("otro.correo@ejemplo.test", "Estudiante 4")]);
{
  const salas = [{ uuid: "u1", host: "comunicaciones", topic, activo: true, eventos: crudos.map(compactarEvento) }];
  const base = { semana: "2026-09-28", franjas, salas, rosterPorCorreo: identidad, ahoraMs: COT("08:31"), actualizadoMs: COT("08:31") };
  const sin = armarRespuestaVivo(base).clases[0];
  const con = armarRespuestaVivo({ ...base, presentesPorSala: new Map([["u1", compactarPresentes(presentes)]]) });
  assert.deepEqual([sin.roster_ahora_aprox, sin.ahora_fuente], [1, "webhook"]);
  assert.deepEqual([con.clases[0].roster_ahora_aprox, con.clases[0].roster_maximo, con.clases[0].ahora_fuente], [3, 3, "zoom"]);
  assert.ok(!/ejemplo|Estudiante|@|10000000/.test(JSON.stringify(con)), "En vivo: sin PII");
}
{
  const salas = [{ uuid: "u1", host: "comunicaciones", topic, activo: true, eventos: crudos.map(({ id: i, evento, ms, correo: c, nombre }) => ({ id: i, evento, ms, correo: c, nombre })) }];
  const base = { semana: "2026-09-28", franjasHoy: franjas, salas, roster, registrantes, ahoraMs: COT("08:31"), actualizadoMs: COT("08:31") };
  const sin = armarListaVivo(base).clases[0];
  const con = armarListaVivo({ ...base, presentesPorSala: new Map([["u1", presentes]]) }).clases[0];
  assert.deepEqual([sin.cifras.roster.en_sala, sin.ahora_fuente], [1, "webhook"]);
  assert.deepEqual([con.cifras.roster.total, con.cifras.roster.en_sala, con.ahora_fuente], [3, 3, "zoom"]);
  const p4 = con.personas.find((p) => p.cedula === "100000004");
  assert.ok(p4 && p4.en_sala && p4.como === "cédula del registro de Zoom", "solo en Zoom: entra con la misma identificacion");
  assert.equal(con.personas.find((p) => p.cedula === "100000001").en_sala, true, "reentrada perdida: Zoom la corrige");
}

// ---------- 5) lector de servidor (zoomEnVivo.ts) con fetch falso
async function cargarZoom({ rapido = false } = {}) {
  const src = await readFile(new URL("../lib/servidor/zoomEnVivo.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  const st = rapido ? (fn, ms) => setTimeout(fn, Math.min(ms, 30)) : setTimeout;
  vm.runInNewContext(js, { exports, require: (n) => (n === "server-only" ? {} : n.endsWith("/zoomPresentes.mjs") ? zoomPresentes : (() => { throw new Error(n); })()),
    console, Date, Promise, Map, Set, Number, String, Math, JSON, Buffer, URL, AbortController, setTimeout: st, clearTimeout, Error }, {});
  return exports;
}
const ENV = { ZOOM_ACCOUNT_ID: "cuenta-falsa", ZOOM_CLIENT_ID: "cliente-falso", ZOOM_CLIENT_SECRET: "secreto-falso", ZOOM_HOSTS: "host1@ejemplo.test, host2@ejemplo.test" };
const UUID = "/ab//cd==";
function zoomFalso({ estados = {}, colgar = false } = {}) {
  const urls = [];
  const resp = (status, body) => new Response(JSON.stringify(body), { status });
  const f = async (url) => {
    urls.push(String(url));
    if (colgar) return new Promise(() => {});
    const u = String(url);
    for (const [patron, st] of Object.entries(estados)) if (u.includes(patron)) return resp(st, { message: "x" });
    if (u.startsWith("https://zoom.us/oauth/token")) return resp(200, { access_token: "token-falso", expires_in: 3600 });
    if (u.includes("/users/host1%40ejemplo.test/meetings")) return resp(200, { meetings: [{ id: 111 }] });
    if (u.includes("/users/host2%40ejemplo.test/meetings")) return resp(200, { meetings: [{ id: 222 }] });
    if (u.endsWith("/meetings/111")) return resp(200, { uuid: UUID });
    if (u.endsWith("/meetings/222")) return resp(200, { uuid: "uuid-2" });
    if (u.includes("/participants?type=live")) {
      const sala2 = u.includes("/metrics/meetings/uuid-2/");
      if (!sala2 && !u.includes("next_page_token")) return resp(200, { participants: [part(correo(1), "E1"), part(correo(2), "E2", "in_waiting_room")], next_page_token: "pag2" });
      return resp(200, { participants: sala2 ? [part(correo(5), "E5")] : [part(correo(3), "E3")], next_page_token: "" });
    }
    return resp(404, {});
  };
  return { f, urls };
}
{
  const z = await cargarZoom();
  const apagado = await z.presentesZoom(COT("08:30"), async () => { throw new Error("no debia llamar"); }, {});
  assert.deepEqual([apagado.estado, apagado.salas], ["apagado", null], "sin variables: apagado, 0 llamadas");

  const { f, urls } = zoomFalso();
  const [a, b] = await Promise.all([z.presentesZoom(COT("08:30"), f, ENV), z.presentesZoom(COT("08:30") + 10, f, ENV)]);
  assert.equal(a, b, "una sola lectura en vuelo");
  assert.equal(a.estado, "ok");
  assert.deepEqual([...a.salas.keys()].sort(), ["/ab//cd==", "uuid-2"]);
  assert.deepEqual(a.salas.get(UUID).map((p) => p.correo).sort(), [correo(1), correo(3)], "pagina 2 incluida, sala de espera fuera");
  assert.ok(urls.some((u) => u.includes("/metrics/meetings/%252Fab%252F%252Fcd%253D%253D/participants?type=live")), "uuid doble-codificado");
  assert.equal(urls.filter((u) => u.includes("oauth/token")).length, 1);
  const n = urls.length;
  await z.presentesZoom(COT("08:30") + 19_000, f, ENV);
  assert.equal(urls.length, n, "cache compartido de 20 s");
  await z.presentesZoom(COT("08:30") + 21_000, f, ENV);
  assert.ok(urls.length > n, "vencido el cache, se vuelve a leer");
  assert.equal(urls.filter((u) => u.includes("oauth/token")).length, 1, "el token se reutiliza");
}
{
  const z = await cargarZoom();
  const { f, urls } = zoomFalso({ estados: { "/participants": 429 } });
  const r = await z.presentesZoom(COT("08:30"), f, ENV);
  assert.deepEqual([r.estado, r.salas], ["limite", null], "429: el panel sigue con webhooks");
  const n = urls.length;
  const r2 = await z.presentesZoom(COT("08:30") + 30_000, f, ENV);
  assert.equal(urls.length, n, "pausa tras 429: no se llama a Zoom");
  assert.equal(r2.estado, "limite");
  await z.presentesZoom(COT("08:30") + 61_000, f, ENV);
  assert.ok(urls.length > n, "pasada la pausa se reintenta");
}
{
  const z = await cargarZoom();
  const { f } = zoomFalso({ estados: { "/users/host2%40ejemplo.test/meetings": 500 } });
  const r = await z.presentesZoom(COT("08:30"), f, ENV);
  assert.equal(r.estado, "ok", "un host caido no tumba al otro");
  assert.deepEqual([...r.salas.keys()], [UUID]);
}
{
  const z = await cargarZoom({ rapido: true });
  const { f } = zoomFalso({ colgar: true });
  const t0 = Date.now();
  const r = await z.presentesZoom(COT("08:30"), f, ENV);
  assert.equal(r.estado, "fallo", "Zoom colgado: tope total, no se espera");
  assert.ok(Date.now() - t0 < 2000);
}
{
  const fuente = await readFile(new URL("../lib/servidor/zoomEnVivo.ts", import.meta.url), "utf8");
  assert.ok(!/console\./.test(fuente), "el lector no escribe en consola (ni token ni correos)");
  assert.ok(/^import "server-only";/.test(fuente), "solo servidor");
}
console.log("RESUMEN: vivo_zoom presentes=in_meeting,dedupe_correo,bots_personal conteos=concilia nominal=concilia no_concilia=terminada,sala_faltante,apagado lector=ruta_por_host,uuid_doble,cache_20s,una_en_vuelo,429_pausa,host_caido,tope_total estado=verde");
