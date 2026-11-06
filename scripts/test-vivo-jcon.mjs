import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/vivoCalculo.mjs";
import * as nominal from "../lib/vivoNominal.mjs";
import * as zoomPresentes from "../lib/zoomPresentes.mjs";
import * as jcon from "../lib/vivoJcon.mjs";
import { VIVO_DEMO, VIVO_DEMO_JCON } from "../lib/vivo-demo.mjs";
import { LISTA_VIVO_DEMO, LISTA_VIVO_DEMO_JCON } from "../lib/vivoNominal-demo.mjs";
import { renderizar } from "./render-componente.mjs";

// TOC-208: JC-ON en «En vivo» y «Lista en vivo», SEPARADO de JC. Datos 100 % sinteticos (@ejemplo.test, cedulas 9xxxxx).
// Requisito numero uno: JC-ON nunca suma a cifras, franjas, roster ni caches de JC (y viceversa). Se prueba con un Supabase simulado
// que IGNORA los filtros de curso (.or / .ilike): peor caso, la base devuelve TODOS los eventos y el codigo debe separar igual.
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

async function compilar(ruta, require) {
  const src = await readFile(new URL(ruta, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require, console, Date, Promise, Map, Set, Number, Math, JSON, String, Boolean, Response, URL, setTimeout, clearTimeout }, {});
  return exports;
}

// ---------- 1) clasificador de tema
const TEMA_V = "Sesión JCON1- Viernes 10:00 a.m. - 12  p.m.";
const TEMA_S = "Sesión JCON2 - Sábado 2:00 p.m. - 4:00 p.m.";
const TEMA_JC = "Backend: APIs y Base de Datos";
eq(jcon.grupoJcon(TEMA_V), "V"); eq(jcon.grupoJcon(TEMA_S), "S");
eq(jcon.grupoJcon("sesion jcon viernes"), "V", "jcon + viernes sin numero");
eq(jcon.grupoJcon("JC sábado clase"), null, "sin jcon no es JC-ON"); eq(jcon.grupoJcon("JC-ON sábado"), "S", "JC-ON con guion");
eq(jcon.grupoJcon("JCON sábado"), "S");
for (const t of [TEMA_JC, "DESARROLLO WEB - Básico", "Desarrollo Web Avanzado", "", null, "Reunión de monitores"]) eq(jcon.grupoJcon(t), null, `JC/otros no son JC-ON: ${t}`);
for (const t of ["Bienvenida JCON B1", "JCON1 Bienvenida viernes", "Entrevistas JCON2", "Reunión equipo JCON", "JCON reunion sabado", "Equipo JCON1"]) eq(jcon.grupoJcon(t), null, `excluido: ${t}`);
// y JC jamas toma un tema JCON
for (const t of [TEMA_V, TEMA_S, "Bienvenida JCON B1"]) eq(calculo.esClase(t), false, `esClase (JC) rechaza ${t}`);
eq(jcon.grupoDeHorario("manana"), "V"); eq(jcon.grupoDeHorario("mañana"), "V"); eq(jcon.grupoDeHorario("tarde"), "S"); eq(jcon.grupoDeHorario(null), null);

// ---------- 2) franjas sinteticas y roster
const LUNES = "2026-11-02";
const fr = jcon.franjasJcon(LUNES, { V: 3, S: 4 });
eq(fr.map((f) => [f.slot_id, f.fecha, f.hora_inicio, f.hora_fin, f.cuenta_zoom, f.roster_n]),
  [["jcon-viernes-10", "2026-11-06", 10, 12, "jovenescreativos", 3], ["jcon-sabado-14", "2026-11-07", 14, 16, "jovenescreativos", 4]]);
eq(fr.map(jcon.etiquetaJcon), ["JC-ON · Grupo V (viernes)", "JC-ON · Grupo S (sábado)"]);
eq(jcon.lunesDe("2026-11-07"), LUNES);
eq(jcon.asociarSalaJcon({ topic: TEMA_S }, fr), "jcon-sabado-14");
eq(jcon.asociarSalaJcon({ topic: TEMA_V }, fr.filter((f) => f.fecha === "2026-11-07")), null, "sala JCON1 el sabado: no se asocia a nada");
eq(jcon.asociarSalaJcon({ topic: TEMA_JC }, fr), null);

const est = (i, horario, estado = "activo", extra = {}) => ({ cedula: String(900000 + i), email: `jcon${i}@ejemplo.test`, nombres: "Egresada", apellidos: `Prueba ${i}`,
  horario, estado, grupo_ciudad: i % 2 ? "Cali" : "Bogotá", ...extra });
const ESTUDIANTES = [est(1, "manana"), est(2, "manana"), est(3, "manana"), est(4, "tarde"), est(5, "tarde"), est(6, "tarde"), est(7, "tarde", "Activo"),
  est(8, "tarde", "retirado"), est(9, null)];
const r = jcon.rosterJcon(ESTUDIANTES);
eq(r.n, { V: 3, S: 4 }, "solo activos (mayusculas o no); retirado fuera; sin horario fuera");
eq(r.descartados, 1);
eq(r.filas.find((f) => f.persona_id === "900004"), { persona_id: "900004", correo_norm: "jcon4@ejemplo.test", nombre: "Egresada Prueba 4", ciudad: "Bogotá", slot_id: "jcon-sabado-14" });

// ---------- 3) combinarRespuestas
const base = (o) => ({ disponible: true, actualizado_en: "2026-11-07T19:30:00.000Z", semana: LUNES, hora_servidor: "2026-11-07T19:30:00.000Z", clases: [], aviso_general: null, ...o });
const jcResp = base({ clases: [{ slot_id: "a" }], aviso_general: "aviso JC" });
const sinJcon = base({});
ok(jcon.combinarRespuestas(jcResp, sinJcon) === jcResp, "dia sin JC-ON: la respuesta de JC sale tal cual (mismo objeto)");
const conJcon = base({ clases: [{ slot_id: "jcon-sabado-14", programa: "jcon" }], actualizado_en: "2026-11-07T19:29:00.000Z", aviso_general: "x" });
const m = jcon.combinarRespuestas(jcResp, conJcon);
eq(m.clases.map((c) => c.slot_id), ["a", "jcon-sabado-14"], "JC primero, intacto; JC-ON al final");
eq(m.aviso_general, "aviso JC JC-ON: x"); eq(m.actualizado_en, "2026-11-07T19:29:00.000Z", "la lectura mas vieja manda");
eq(jcon.combinarRespuestas(jcResp, null, { falloJcon: true }).aviso_general, `aviso JC ${jcon.AVISO_FALLO_JCON}`, "JC-ON falla: JC + aviso");
eq(jcon.combinarRespuestas(jcResp, null, { falloJcon: true }).clases, jcResp.clases);
const jcNo = base({ disponible: false, aviso_general: "La semana actual todavía no está congelada: no hay clases para mostrar." });
const m2 = jcon.combinarRespuestas(jcNo, conJcon);
ok(m2.disponible && m2.clases.length === 1 && /^JC: La semana/.test(m2.aviso_general), "semana JC sin congelar: JC-ON igual se muestra");
ok(jcon.combinarRespuestas(jcNo, sinJcon) === jcNo, "semana JC sin congelar y sin JC-ON: igual que antes");
const m3 = jcon.combinarRespuestas(null, conJcon, { falloJc: true });
ok(m3.clases.length === 1 && m3.aviso_general.startsWith(jcon.AVISO_FALLO_JC), "JC falla: JC-ON sale con aviso");
eq(jcon.combinarRespuestas(null, sinJcon, { falloJc: true }), null, "JC falla y no hay JC-ON: 503 como antes");
eq(jcon.combinarRespuestas(null, null), null);

// ---------- 4) lectores con Supabase simulado: sabado 2026-11-07, clase JC-ON grupo S 14:00 y una franja JC a la MISMA hora y cuenta
const SAB = "2026-11-07";
const COT = (hhmm, fecha = SAB) => Date.parse(`${fecha}T${hhmm}:00-05:00`);
const FRANJAS_JC = [{ slot_id: "backend-sábado-14", dia: "sábado", fecha: SAB, hora_inicio: 14, hora_fin: 16, tipo: "Basico", cuenta_zoom: "jovenescreativos", roster_n: 3 }];
const ROSTER_JC = [1, 2, 3].map((i) => ({ persona_id: String(800000 + i), correo_norm: `jc${i}@ejemplo.test`, nombre: `JC Prueba ${i}`, ciudad: "Cali", slot_id: "backend-sábado-14" }));
let id = 1;
const ev = (evento, hhmm, correo, uuid, curso, registrant_id = null, nombre = null) => ({ id: id++, evento, correo, nombre, hora_ms: COT(hhmm), uuid, curso, registrant_id });
const EV_JC = [ev("joined", "14:01", "jc1@ejemplo.test", "u-jc", TEMA_JC), ev("joined", "14:02", "jc2@ejemplo.test", "u-jc", TEMA_JC),
  ev("joined", "14:03", "jcon5@ejemplo.test", "u-jc", TEMA_JC), // una JC-ON en la sala de JC: para JC es una desconocida, como siempre
  ev("left", "14:20", "jc2@ejemplo.test", "u-jc", TEMA_JC)];
const EV_JCON = [ev("joined", "14:01", "jcon4@ejemplo.test", "u-jcon", TEMA_S), ev("joined", "14:02", "jcon5@ejemplo.test", "u-jcon", TEMA_S),
  ev("joined", "14:03", "celular6@ejemplo.test", "u-jcon", TEMA_S, "RID-6"),          // registrant_id -> cedula 900006 -> roster S
  ev("joined", "14:04", "jcon1@ejemplo.test", "u-jcon", TEMA_S),                       // grupo V en la sala S: colada
  ev("joined", "14:05", "jc3@ejemplo.test", "u-jcon", TEMA_S),                         // de JC: aqui no es nadie (sin identificar)
  ev("joined", "14:06", "monitor@tocaunavida.org", "u-jcon", TEMA_S),
  ev("joined", "14:07", "jcon8@ejemplo.test", "u-jcon", TEMA_S),                       // retirada: sin identificar
  ev("left", "14:25", "jcon5@ejemplo.test", "u-jcon", TEMA_S),
  ev("joined", "14:08", "otra@ejemplo.test", "u-bienv", "Bienvenida JCON B2")];         // tema excluido: no cuenta en ningun lado
const ACTIVAS = [{ uuid: "u-jc", host: "jovenescreativos", topic: TEMA_JC, activo: true, actualizado_en: new Date(COT("14:00")).toISOString() },
  { uuid: "u-jcon", host: "jovenescreativos", topic: TEMA_S, activo: true, actualizado_en: new Date(COT("14:00")).toISOString() },
  { uuid: "u-bienv", host: "jovenescreativos", topic: "Bienvenida JCON B2", activo: true, actualizado_en: new Date(COT("14:00")).toISOString() }];
const REGISTRANTES = [{ registrant_id: "RID-6", correo_norm: "registro6@ejemplo.test", cedula_digitos: "900006", nombre: "Egresada", apellido: "Prueba 6", fecha_sesion: "2026-10-31" }];

function simular({ eventos, fallaJcon = false }) {
  const tablas = { asist_semanas: [{ semana: LUNES }], asist_franjas: FRANJAS_JC, asist_roster: ROSTER_JC, zoom_reuniones_activas: ACTIVAS, v_asist_zoom_live_panel: eventos,
    v_asist_registrantes_panel: [], zoom_registrantes: REGISTRANTES, "jcon.estudiantes": ESTUDIANTES };
  const log = [];
  const desde = (esquema) => (t) => {
    const nombre = esquema ? `${esquema}.${t}` : t;
    const q = { filtros: [], cols: "" };
    const api = {
      select: (c) => { q.cols = c; return api; }, eq: (c, v) => (q.filtros.push([c, v]), api), in: (c, v) => (q.filtros.push([c, v]), api), gt: (c, v) => (q.filtros.push([c, v]), api),
      gte: () => api, or: () => api, ilike: () => api, order: () => api, limit: () => api, // peor caso: los filtros de curso se ignoran
      range: async (a, b) => {
        log.push({ t: nombre, cols: q.cols });
        if (fallaJcon && nombre === "jcon.estudiantes") return { data: null, error: { message: "permiso denegado" } };
        let rows = tablas[nombre] ?? [];
        for (const [c, val] of q.filtros) if (rows.length && c in rows[0] && c !== "id") rows = rows.filter((x) => (Array.isArray(val) ? val.includes(x[c]) : x[c] === val));
        const gt = q.filtros.find((f) => f[0] === "id")?.[1];
        if (gt != null) rows = rows.filter((x) => x.id > gt);
        return { data: rows.slice(a, b + 1), error: null };
      },
      then: (res) => { log.push({ t: nombre }); return res({ data: (tablas[nombre] ?? []).slice(0, 1), error: null }); },
    };
    return api;
  };
  return { sb: { from: desde(null), schema: (s) => ({ from: desde(s) }) }, log };
}
const requerir = (sim) => (nm) => {
  if (nm === "server-only") return {};
  if (nm.endsWith("/vivoCalculo.mjs")) return calculo;
  if (nm.endsWith("/vivoNominal.mjs")) return nominal;
  if (nm.endsWith("/vivoJcon.mjs")) return jcon;
  if (nm.endsWith("/zoomPresentes.mjs")) return zoomPresentes;
  if (nm.endsWith("/zoomEnVivo")) return { presentesZoom: async () => ({ estado: "apagado", salas: null }) };
  if (nm.endsWith("/supabase")) return { supabaseServidor: () => sim.sb };
  throw new Error(`Import no previsto: ${nm}`);
};
const AHORA = COT("14:30");

// JC sin nada de JC-ON en la base vs JC con todo JC-ON en la base: cifras identicas
async function vivoJc(eventos) { const sim = simular({ eventos }); const l = await compilar("../lib/servidor/leerVivo.ts", requerir(sim)); return l.leerVivo(AHORA); }
const jcSolo = await vivoJc(EV_JC);
const jcMezcla = await vivoJc([...EV_JC, ...EV_JCON]);
eq(jcMezcla, jcSolo, "En vivo JC: identico con y sin eventos/salas JC-ON en la base");
const cJc = jcSolo.clases[0];
eq([cJc.slot_id, cJc.roster_maximo, cJc.roster_ahora_aprox, cJc.desconocidos_maximo, cJc.otra_franja_maximo, cJc.personal_maximo], ["backend-sábado-14", 2, 1, 1, 0, 0],
  "la sala JCON (misma cuenta y hora) no se pega a la franja JC; la JC-ON que entro a JC es desconocida para JC");
ok(!("programa" in cJc), "las clases JC no cambian de forma (sin campo programa)");
ok(!/sin franja/.test(jcMezcla.aviso_general ?? ""), "las salas JCON ni siquiera cuentan como 'sin franja' en JC");

async function vivoJconLeer(eventos, ahora = AHORA, sim = simular({ eventos })) {
  const l = await compilar("../lib/servidor/leerVivoJcon.ts", requerir(sim)); return { r: await l.leerVivoJcon(ahora), sim, l };
}
const { r: jconSolo, sim: simJcon } = await vivoJconLeer(EV_JCON);
const { r: jconMezcla } = await vivoJconLeer([...EV_JC, ...EV_JCON]);
eq(jconMezcla, jconSolo, "En vivo JC-ON: identico con y sin eventos JC en la base");
eq(jconSolo.clases.length, 1, "solo la clase JC-ON de hoy (grupo S)");
const cS = jconSolo.clases[0];
eq([cS.programa, cS.slot_id, cS.etiqueta, cS.cuenta_zoom, cS.estado, cS.roster_total], ["jcon", "jcon-sabado-14", "JC-ON · Grupo S (sábado)", "jovenescreativos", "abierta", 4]);
eq([cS.roster_maximo, cS.roster_ahora_aprox], [3, 2], "jcon4 + jcon5 (salio) + jcon6 por registrant_id");
eq([cS.otra_franja_maximo, cS.otra_franja_ahora_aprox], [1, 1], "jcon1 (grupo V) = colada");
eq(cS.desconocidos_maximo, 2, "jc3 (de JC) y jcon8 (retirada) = sin identificar");
eq(cS.personal_maximo, 1);
ok(simJcon.log.some((x) => x.t === "jcon.estudiantes" && x.cols === "cedula,email,horario,estado"), "roster desde jcon.estudiantes, sin nombres en En vivo");
ok(!simJcon.log.some((x) => /^asist_/.test(x.t)), "JC-ON no lee franjas ni roster de JC");
ok(!JSON.stringify(jconSolo).match(/@|900\d{3}|Egresada/), "En vivo JC-ON: solo conteos, sin correos, cedulas ni nombres");

// egress: dia sin JC-ON (lunes) = 0 lecturas; antes de la ventana visible (sabado 12:00) = 0 lecturas
for (const [hora, fecha] of [["10:00", "2026-11-02"], ["12:00", SAB]]) {
  const sim = simular({ eventos: EV_JCON });
  const { r: x } = await vivoJconLeer(EV_JCON, COT(hora, fecha), sim);
  eq([x.clases.length, sim.log.length], [0, 0], `sin clase JC-ON visible (${fecha} ${hora}): 0 lecturas`);
}
// proxima (13:20, a 40 min): solo el roster (para «inscritas»), sin eventos
{ const sim = simular({ eventos: EV_JCON }); const { r: x } = await vivoJconLeer(EV_JCON, COT("13:20"), sim);
  eq([x.clases[0].estado, x.clases[0].roster_total, sim.log.map((l) => l.t)], ["proxima", 4, ["jcon.estudiantes"]]); }
// cache 30 s + lectura incremental
{ const sim = simular({ eventos: EV_JCON }); const l = await compilar("../lib/servidor/leerVivoJcon.ts", requerir(sim));
  await l.leerVivoJcon(AHORA); const n1 = sim.log.length; await l.leerVivoJcon(AHORA + 10_000);
  eq(sim.log.length, n1, "dentro de 30 s: desde cache, 0 lecturas"); await l.leerVivoJcon(AHORA + 31_000);
  ok(sim.log.filter((x) => x.t === "v_asist_zoom_live_panel").length === 2 && !sim.log.slice(n1).some((x) => x.t === "jcon.estudiantes"), "refresco: eventos incrementales, roster en cache"); }
// fallo de JC-ON: lanza (la ruta sigue con JC)
{ const sim = simular({ eventos: EV_JCON, fallaJcon: true }); const l = await compilar("../lib/servidor/leerVivoJcon.ts", requerir(sim));
  await assert.rejects(l.leerVivoJcon(AHORA)); n += 1; }

// ---------- 5) Lista en vivo
async function listaJc(eventos) { const sim = simular({ eventos }); const l = await compilar("../lib/servidor/leerVivoNominal.ts", requerir(sim)); return l.leerListaVivo(AHORA); }
eq(await listaJc([...EV_JC, ...EV_JCON]), await listaJc(EV_JC), "Lista en vivo JC: identica con y sin JC-ON en la base");
async function listaJcon(eventos) { const sim = simular({ eventos }); const l = await compilar("../lib/servidor/leerVivoNominalJcon.ts", requerir(sim)); return l.leerListaVivoJcon(AHORA); }
const lj = await listaJcon([...EV_JC, ...EV_JCON]);
eq(lj, await listaJcon(EV_JCON), "Lista en vivo JC-ON: identica con y sin eventos JC");
const cl = lj.clases[0];
eq([cl.programa, cl.slot_id, cl.etiqueta, cl.roster_total, cl.ausentes], ["jcon", "jcon-sabado-14", "JC-ON · Grupo S (sábado)", 4, 1]);
const porCorreo = (c) => cl.personas.find((p) => p.correo === c);
eq([porCorreo("jcon1@ejemplo.test").senal, porCorreo("jcon1@ejemplo.test").su_clase], ["otra_franja", "JC-ON · Grupo V (viernes)"], "colada con su clase JC-ON");
eq([porCorreo("celular6@ejemplo.test").senal, porCorreo("celular6@ejemplo.test").como, porCorreo("celular6@ejemplo.test").cedula], ["roster", "registro de Zoom (ID)", "900006"]);
eq(porCorreo("jc3@ejemplo.test").senal, "no_identificado", "persona de JC en la sala JC-ON: no identificada, nunca roster");
eq(cl.personas.find((p) => p.senal === "ausente").cedula, "900007", "ausente = activa del grupo S que no entro");
ok(!cl.personas.some((p) => p.correo === "otra@ejemplo.test"), "la Bienvenida no cuenta");
const monitorCali = nominal.recortarPorPermiso(lj, { ciudad: "Cali" }, (a, b) => a === b);
ok(monitorCali.clases[0].personas.every((p) => p.ciudad === "Cali" && ["roster", "otra_franja", "ausente"].includes(p.senal)), "monitor: solo roster JC-ON de su ciudad");

// ---------- 6) rutas
class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
let modoJc = "ok", modoJcon = "ok";
const rutaVivo = await compilar("../app/api/vivo/route.ts", (nm) => {
  if (nm === "next/server") return { NextResponse };
  if (nm.endsWith("/acceso")) return { exigirAcceso: async () => ({ email: "test-only" }) };
  if (nm.endsWith("/leerVivo")) return { leerVivo: async () => { if (modoJc === "falla") throw new Error("x"); return jcSolo; } };
  if (nm.endsWith("/leerVivoJcon")) return { leerVivoJcon: async () => { if (modoJcon === "falla") throw new Error("x"); return jconSolo; } };
  if (nm.endsWith("/vivoJcon.mjs")) return jcon;
  throw new Error(`Import no previsto: ${nm}`);
});
const pedir = async () => { const x = await rutaVivo.GET(new Request("http://local/api/vivo")); return { status: x.status, body: await x.json() }; };
let rv = await pedir();
eq([rv.status, rv.body.clases.map((c) => c.slot_id)], [200, ["backend-sábado-14", "jcon-sabado-14"]]);
eq(rv.body.clases[0], JSON.parse(JSON.stringify(jcSolo.clases[0])), "la clase JC sale identica");
modoJcon = "falla"; rv = await pedir();
eq([rv.status, rv.body.clases.length, rv.body.clases[0].roster_maximo], [200, 1, 2]); ok(rv.body.aviso_general.includes(jcon.AVISO_FALLO_JCON));
modoJcon = "ok"; modoJc = "falla"; rv = await pedir();
eq([rv.status, rv.body.clases.map((c) => c.slot_id)], [200, ["jcon-sabado-14"]]); ok(rv.body.aviso_general.startsWith(jcon.AVISO_FALLO_JC));
modoJcon = "falla"; rv = await pedir(); eq([rv.status, rv.body], [503, { error: "No disponible" }]);

// ---------- 7) demo
const demo = jcon.combinarRespuestas(VIVO_DEMO.sabado, VIVO_DEMO_JCON);
eq(demo.clases.slice(0, VIVO_DEMO.sabado.clases.length), VIVO_DEMO.sabado.clases, "demo En vivo: JC intacto");
eq(demo.clases.at(-1).programa, "jcon");
const dl = LISTA_VIVO_DEMO_JCON.clases[0];
eq([dl.programa, dl.cifras.roster.total, dl.cifras.otra_franja.total, dl.cifras.no_identificado.total, dl.cifras.personal.total],
  ["jcon", VIVO_DEMO_JCON.clases[0].roster_maximo, VIVO_DEMO_JCON.clases[0].otra_franja_maximo, VIVO_DEMO_JCON.clases[0].desconocidos_maximo, VIVO_DEMO_JCON.clases[0].personal_maximo],
  "demo: En vivo y Lista en vivo JC-ON cuadran");
ok(!LISTA_VIVO_DEMO.clases.some((c) => c.programa), "demo Lista JC sin cambios");

// ---------- 8) pantalla: la tarjeta JC-ON es la misma tarjeta, con acento y etiqueta propios; las de JC no cambian
{ const datos = { ...demo, hora_servidor: "2026-10-10T14:30:00-05:00" };
  const h = await renderizar("components/EnVivoPantalla.tsx", { fase: "ok", datos, edadSeg: 5, reintentar() {} }, { html: true });
  const t = await renderizar("components/EnVivoPantalla.tsx", { fase: "ok", datos, edadSeg: 5, reintentar() {} });
  eq((h.match(/data-programa="jcon"/g) ?? []).length, 1, "una tarjeta JC-ON");
  eq((h.match(/vivo-tarjeta[^"]*vivo-jcon/g) ?? []).length, 1, "acento verde solo en JC-ON");
  for (const x of ["JC-ON · programa aparte de JC", "Clase de las 14:00 · JC-ON · Grupo S (sábado)", "En su horario: 4 de 5", "Colados (otra clase): 1", "Ingresaron: 5 (4 en su horario + 1 colados)"])
    ok(t.includes(x), `falta «${x}»`);
  const hJc = await renderizar("components/EnVivoPantalla.tsx", { fase: "ok", datos: { ...VIVO_DEMO.sabado, hora_servidor: "2026-10-10T14:30:00-05:00" }, edadSeg: 5, reintentar() {} }, { html: true });
  ok(!/vivo-jcon|vivo-programa/.test(hJc), "sin JC-ON, ninguna tarjeta JC lleva la marca");
}

console.log(`RESUMEN: vivo_jcon tests=${n} clasificador=ok separacion_jc=identica colados=ok registrant_id=ok egress=0_sin_clase rutas=jc_y_jcon_independientes estado=verde`);
