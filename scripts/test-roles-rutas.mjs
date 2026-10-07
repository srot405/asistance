// V2 (TOC-148): roles + auditoria de descargas, de punta a punta con la cadena REAL acceso.ts -> rol.ts -> auditoria.ts y las rutas
// /api/exportar-nominal, /api/visitas y /api/rol, contra un Supabase simulado (auth.getUser, RPC panel_rol_de, insert panel_descargas).
// 3 cuentas (admin, monitor, sin rol) + compatibilidad + RPC caida + ?ciudad= manipulado. Datos 100 % sinteticos (@ejemplo.test).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as roles from "../lib/rolesCalculo.mjs";
import * as authConfig from "../lib/auth.config.js";
import { construirCsvNominal, construirCsvPresencia, construirCsvTiempo } from "../lib/exportarNominal.mjs";
import { construirCsvReporte } from "../lib/reporteSemana.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

const usuario = (email) => ({ email, email_confirmed_at: "2026-01-01", app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { custom_claims: { hd: "tocaunavida.org" } } });
const USUARIOS = { "tok-admin": "admin@tocaunavida.org", "tok-monitor": "monitor@tocaunavida.org", "tok-sinrol": "sinrol@tocaunavida.org" };
const TABLA_ROLES = { "admin@tocaunavida.org": { rol: "admin", ciudad: null }, "monitor@tocaunavida.org": { rol: "monitor", ciudad: "bogota" } };

const FILAS = { ausentes: [
  { nombre: "Ana Cali", ciudad: "Cali", slot_id: "a", fecha: "2026-09-15" },
  { nombre: "Beto Bogota", ciudad: "Bogotá", slot_id: "a", fecha: "2026-09-15" }] };
const VISITAS = [
  { visitante: "Visita Cali", ciudad: "Cali", franja_propia: "a", horario_propia: "A", franja_visitada: "b", horario_visitada: "B", fecha: "2026-09-15", pct_tiempo: 60, veredicto: "cumple" },
  { visitante: "Visita Bogota", ciudad: "BOGOTA", franja_propia: "a", horario_propia: "A", franja_visitada: "b", horario_visitada: "B", fecha: "2026-09-15", pct_tiempo: 40, veredicto: "rojo_tiempo" }];

// escenario: { modoRoles: "compat"|"estricto"|"caida", fallaInsert, demo }
async function montar(escenario) {
  const registros = []; const rpcLlamadas = []; const logs = []; const lecturas = [];
  const supabase = { supabaseServidor: () => ({
    auth: { getUser: async (token) => USUARIOS[token] ? { data: { user: usuario(USUARIOS[token]) }, error: null } : { data: { user: null }, error: { message: "x" } } },
    rpc: async (nombre, args) => {
      assert.equal(nombre, "panel_rol_de"); rpcLlamadas.push(args.p_correo);
      if (escenario.modoRoles === "caida") return { data: null, error: { message: "secreto-interno" } };
      if (escenario.modoRoles === "compat") return { data: { modo: "compatibilidad" }, error: null };
      const f = TABLA_ROLES[args.p_correo];
      return { data: f ? { modo: "estricto", ...f } : { modo: "estricto", rol: "sin_rol", ciudad: null }, error: null };
    },
    from: (tabla) => { assert.equal(tabla, "panel_descargas"); return { insert: async (fila) => {
      if (escenario.fallaInsert) return { error: { message: "insert roto" } };
      registros.push(fila); return { error: null }; } }; },
  }) };
  const modulos = {};
  const req = (name) => {
    if (name === "next/server") return { NextResponse };
    if (name === "server-only") return {};
    if (name.endsWith("/demo.js")) return { MODO_DEMO: Boolean(escenario.demo) };
    if (name.endsWith("/auth.config.js")) return authConfig;
    if (name.endsWith("/rolesCalculo.mjs")) return roles;
    if (name.endsWith("/supabase")) return supabase;
    if (name === "./rol") return modulos.rol;
    if (name === "./acceso" || name.endsWith("/servidor/acceso")) return modulos.acceso;
    if (name.endsWith("/servidor/auditoria")) return modulos.auditoria;
    if (name.endsWith("/leerDetalleSemana")) return { semanaTieneDetalle: async () => true, nivelSemana: async () => "Detalle",
      leerReporteSemana: async () => ({ semana: "2026-09-14", tiempos: null, baseTexto: "", completa: true, hayRevision: false, nivel: "Detalle", cuadra: true,
        comparacion: { estado: "SIN_COMPARAR", detalle: [] }, multiples: [], sinResumen: true, cuadre: { roster: 2, medible: 2, fueraDato: 0, pendiente: 0, sinClase: 0 },
        sinDato: [], filas: FILAS.ausentes.map((f, i) => ({ persona_id: String(i), nombre: f.nombre, ciudad: f.ciudad, franja: "a", fecha: f.fecha, semanal: "SI", dia: "SI" })) }),
      listarAusentesNominal: async (semana, opts) => { lecturas.push(opts); return FILAS.ausentes; } };
    if (name.endsWith("/leerPresenciaClase")) return { listarPresenciaNominal: async () => FILAS.ausentes.map((f) => ({ nombre: f.nombre, ciudad: f.ciudad, estado: "presente", minutos: 90 })) };
    if (name.endsWith("/leerTiempo")) return { listarTiempoNominal: async (s, filtro) => { lecturas.push(filtro);
      return FILAS.ausentes.map((f) => ({ nombre: f.nombre, ciudad: f.ciudad, franja: "a", franja_tiempo: "a", es_visita: false, fecha: f.fecha, pct_tiempo: 70, estado_tiempo: "cumple", cumple_50: true, minutos: 80, motivo_sin_dato: null, definitivo: true })); } };
    if (name.endsWith("/leerVisitas")) return { leerVisitasSemana: async (s, filtro) => { lecturas.push(filtro);
      return { disponible: true, semana: s, filtro, visitas: VISITAS, resumen: { total: 2, cumplen: 1, rojo: 1, sin_dato: 0, pendientes: 0 }, matriz: { origenes: [], destinos: [], celdas: [] },
        sin_identificar: { total: 0, por_motivo: [] }, cuadre: { estado: "OK", detalle: [] } }; } };
    if (name.endsWith("/exportarNominal.mjs")) return { construirCsvNominal, construirCsvPresencia, construirCsvTiempo };
    if (name.endsWith("/reporteSemana.mjs")) return { construirCsvReporte };
    throw new Error(`Import no previsto: ${name}`);
  };
  const consola = { error: (m) => logs.push(String(m)), log() {} };
  const cargar = async (ruta, clave) => { const exports = {}; vm.runInNewContext(await compilar(ruta), { exports, require: req, Response, URL, Request, console: consola }); if (clave) modulos[clave] = exports; return exports; };
  await cargar("../lib/servidor/rol.ts", "rol"); await cargar("../lib/servidor/auditoria.ts", "auditoria"); await cargar("../lib/servidor/acceso.ts", "acceso");
  const rutas = { nominal: await cargar("../app/api/exportar-nominal/route.ts"), visitas: await cargar("../app/api/visitas/route.ts"), rol: await cargar("../app/api/rol/route.ts") };
  return { rutas, registros, rpcLlamadas, logs, lecturas, rol: modulos.rol };
}
const pedir = (ruta, url, token) => ruta.GET(new Request(`http://local${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
const NOM = "/api/exportar-nominal?semana=2026-09-14";

// ---- ESTRICTO: 3 cuentas -------------------------------------------------------------------------------------------------
{
  const m = await montar({ modoRoles: "estricto" });
  const a = await pedir(m.rutas.nominal, `${NOM}&alcance=semana`, "tok-admin");
  assert.equal(a.status, 200); const ta = await a.text(); assert.match(ta, /Ana Cali/); assert.match(ta, /Beto Bogota/);
  // monitor (rol guardado "bogota" sin tilde; datos "Bogotá"): solo su ciudad, comparada normalizada
  const mo = await pedir(m.rutas.nominal, `${NOM}&alcance=semana`, "tok-monitor");
  assert.equal(mo.status, 200); const tm = await mo.text(); assert.match(tm, /Beto Bogota/); assert.equal(tm.includes("Ana Cali"), false, "monitor no ve Cali");
  // parametro ciudad manipulado: 403 y NINGUNA lectura
  const antes = m.lecturas.length;
  const mala = await pedir(m.rutas.nominal, `${NOM}&alcance=semana&ciudad=Cali`, "tok-monitor");
  assert.equal(mala.status, 403); assert.equal(m.lecturas.length, antes, "ni siquiera se lee la ciudad ajena");
  assert.equal((await pedir(m.rutas.nominal, `${NOM}&alcance=semana&ciudad=bogot%C3%A1`, "tok-monitor")).status, 200, "su ciudad con otra grafia pasa");
  for (const q of ["&vista=tiempo", "&vista=presencia&franja=a", "&vista=reporte"]) {
    const r = await pedir(m.rutas.nominal, `${NOM}${q}`, "tok-monitor"); assert.equal(r.status, 200, q);
    const t = await r.text(); assert.equal(t.includes("Ana Cali"), false, `monitor ${q} sin Cali`); assert.match(t, /Beto Bogota/);
  }
  assert.ok(m.lecturas.some((f) => f.ciudad === "bogota"), "el filtro del servidor es el del rol");
  // sin rol: 403 en TODO lo nominal, sin nombres en la respuesta
  for (const url of [`${NOM}&alcance=semana`, `${NOM}&vista=tiempo`, `${NOM}&vista=reporte`, `${NOM}&vista=presencia&franja=a`, "/api/visitas?semana=2026-09-14"]) {
    const r = await pedir(url.startsWith("/api/visitas") ? m.rutas.visitas : m.rutas.nominal, url, "tok-sinrol");
    assert.equal(r.status, 403, url); const t = await r.text();
    for (const n of ["Ana Cali", "Beto Bogota", "Visita Cali", "Visita Bogota"]) assert.equal(t.includes(n), false, `sin_rol sin nombres (${url})`);
  }
  // visitas: admin ve 2; monitor 1 (normalizada BOGOTA == Bogota)
  assert.equal((await (await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14", "tok-admin")).json()).visitas.length, 2);
  const vm_ = await (await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14", "tok-monitor")).json();
  assert.deepEqual(vm_.visitas.map((v) => v.visitante), ["Visita Bogota"]);
  assert.equal((await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14&ciudad=Cali", "tok-monitor")).status, 403);
  assert.equal((await pedir(m.rutas.nominal, NOM)).status, 401, "sin token: 401 antes de cualquier rol");
  // /api/rol: lo que ve el navegador, sin correo
  const rm = await (await pedir(m.rutas.rol, "/api/rol", "tok-monitor")).json();
  assert.deepEqual(rm, { modo: "estricto", rol: "monitor", ciudad: "bogota", nominal: "ciudad" });
  const rs = await (await pedir(m.rutas.rol, "/api/rol", "tok-sinrol")).json(); assert.equal(rs.nominal, "ninguno");
  assert.equal(JSON.stringify(rm).includes("@"), false);
  // auditoria: una fila por descarga OK, correo en minusculas y sin contenido; las denegadas no registran
  const vistas = m.registros.map((r) => r.vista);
  for (const v of ["ausentes_semana", "tiempo", "presencia", "reporte", "visitas"]) assert.ok(vistas.includes(v), v);
  for (const r of m.registros) { assert.deepEqual(Object.keys(r).sort(), ["ciudad", "correo", "filas", "semana", "vista"]); assert.equal(r.correo, r.correo.toLowerCase()); }
  assert.equal(m.registros.filter((r) => r.correo.startsWith("sinrol")).length, 0, "denegado no registra");
  const rv = m.registros.find((r) => r.correo.startsWith("monitor") && r.vista === "visitas"); assert.equal(rv.filas, 1); assert.equal(rv.ciudad, "bogota");
  assert.equal(JSON.stringify(m.registros).includes("Ana"), false, "la auditoria no guarda contenido");
  assert.equal(new Set(m.rpcLlamadas).size, 3); assert.equal(m.rpcLlamadas.length, 3, "cache ~60 s: una RPC por correo");
}

// ---- COMPATIBILIDAD: comportamiento actual exacto ------------------------------------------------------------------------
{
  const m = await montar({ modoRoles: "compat" });
  for (const tok of ["tok-admin", "tok-monitor", "tok-sinrol"]) {
    const r = await pedir(m.rutas.nominal, `${NOM}&alcance=semana&ciudad=Cali`, tok); assert.equal(r.status, 200, tok);
    assert.equal(m.lecturas.at(-1).ciudad, "Cali", "el filtro pedido sigue igual");
  }
  const t = await (await pedir(m.rutas.nominal, `${NOM}&alcance=semana`, "tok-sinrol")).text(); assert.match(t, /Ana Cali/); assert.match(t, /Beto Bogota/);
  assert.equal((await (await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14", "tok-sinrol")).json()).visitas.length, 2);
  assert.equal((await (await pedir(m.rutas.rol, "/api/rol", "tok-sinrol")).json()).nominal, "todo");
  // fallo al registrar en compatibilidad: la descarga SIGUE y queda en el log
  const f = await montar({ modoRoles: "compat", fallaInsert: true });
  const r = await pedir(f.rutas.nominal, `${NOM}&alcance=semana`, "tok-admin"); assert.equal(r.status, 200);
  assert.ok(f.logs.some((l) => /panel_descargas/.test(l)), "queda en el log del servidor");
  assert.equal(f.logs.join("").includes("insert roto"), false, "sin detalles internos en el log");
}

// ---- ESTRICTO con auditoria rota: sin rastro no hay nominal -----------------------------------------------------------------
{
  const m = await montar({ modoRoles: "estricto", fallaInsert: true });
  const r = await pedir(m.rutas.nominal, `${NOM}&alcance=semana`, "tok-admin"); assert.equal(r.status, 503);
  assert.equal((await r.text()).includes("Ana Cali"), false);
  assert.equal((await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14", "tok-admin")).status, 503);
}

// ---- RPC CAIDA: se niega el nominal (503), nunca se abre -------------------------------------------------------------------
{
  const m = await montar({ modoRoles: "caida" });
  for (const tok of ["tok-admin", "tok-monitor", "tok-sinrol"]) {
    const r = await pedir(m.rutas.nominal, `${NOM}&alcance=semana`, tok); assert.equal(r.status, 503, tok);
    const t = await r.text(); assert.equal(t.includes("Ana Cali"), false); assert.equal(t.includes("secreto-interno"), false);
    assert.equal((await pedir(m.rutas.visitas, "/api/visitas?semana=2026-09-14", tok)).status, 503);
  }
  assert.equal(m.registros.length, 0);
  assert.equal((await (await pedir(m.rutas.rol, "/api/rol", "tok-admin")).json()).nominal, "error");
  assert.ok(m.logs.some((l) => /panel_rol_de/.test(l)));
  assert.equal(m.logs.join("").includes("secreto-interno"), false);
}

// ---- Cache de rol: expira, el fallo se recuerda poco ----------------------------------------------------------------------
{
  const m = await montar({ modoRoles: "estricto" });
  let t = 1_000_000; let n = 0; let falla = true;
  const rpc = async () => { n++; if (falla) throw new Error("x"); return { modo: "estricto", rol: "admin", ciudad: null }; };
  assert.equal((await m.rol.rolDe("u1@tocaunavida.org", rpc, () => t)).nominal, "error"); assert.equal(n, 1);
  await m.rol.rolDe("U1@tocaunavida.org ", rpc, () => t); assert.equal(n, 1, "el fallo se recuerda unos segundos (y el correo se normaliza)");
  falla = false; t += 6_000;
  assert.equal((await m.rol.rolDe("u1@tocaunavida.org", rpc, () => t)).nominal, "todo"); assert.equal(n, 2);
  t += 59_000; await m.rol.rolDe("u1@tocaunavida.org", rpc, () => t); assert.equal(n, 2, "acierto vigente ~60 s");
  t += 2_000; await m.rol.rolDe("u1@tocaunavida.org", rpc, () => t); assert.equal(n, 3, "vencido: se relee");
  assert.equal((await m.rol.rolDe("", rpc, () => t)).nominal, "error", "sin correo no hay acceso");
  for (const raro of [null, {}, { modo: "estricto" }, { modo: "estricto", rol: "root" }, "admin", { modo: "estricto", rol: "monitor", ciudad: " " }]) {
    assert.notEqual(roles.resolverAcceso(raro).nominal, "todo", JSON.stringify(raro));
  }
}

// ---- DEMO: roles de practica con ?rol_demo= (solo MODO_DEMO + demo=1) -------------------------------------------------------
{
  const m = await montar({ modoRoles: "estricto", demo: true });
  const base = `${NOM}&alcance=semana&demo=1`;
  assert.equal((await pedir(m.rutas.nominal, base)).status, 200, "demo sin rol_demo = compatibilidad");
  assert.equal((await pedir(m.rutas.nominal, `${base}&rol_demo=sin_rol`)).status, 403);
  const tm = await (await pedir(m.rutas.nominal, `${base}&rol_demo=monitor&ciudad_demo=Cali`)).text();
  assert.match(tm, /Ana Cali/); assert.equal(tm.includes("Beto Bogota"), false);
  assert.equal(m.registros.length, 0, "el demo no audita");
  const off = await montar({ modoRoles: "estricto", demo: false });
  assert.equal((await pedir(off.rutas.nominal, `${base}&rol_demo=admin`)).status, 401, "sin MODO_DEMO el demo no abre nada");
}

console.log("RESUMEN: roles_rutas admin=todo monitor=solo_su_ciudad(normalizada) sin_rol=403 ciudad_manipulada=403 rpc_caida=503 compat=igual auditoria=sin_contenido cache=60s demo=ok estado=verde");
