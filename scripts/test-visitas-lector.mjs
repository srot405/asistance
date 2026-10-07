// lib/servidor/leerVisitas.ts contra un Supabase simulado FIEL (respeta eq, order y range): pagina siempre (PostgREST corta en
// 1000 filas sin avisar), pide solo es_visita, degrada sin tablas y el nominal de pantalla coincide con el CSV de tiempo
// (listarTiempoNominal, vista=tiempo). Datos 100 % sinteticos.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/tiempoCalculo.mjs";
import * as demo from "../lib/tiempo-demo.mjs";
import * as visitasCalculo from "../lib/visitasCalculo.mjs";
import { construirCsvTiempo } from "../lib/exportarNominal.mjs";

const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function cargar(datos, fallos = {}) {
  const consultas = [];
  const supabase = { supabaseServidor: () => ({ from: (tabla) => {
    const q = { tabla, filtros: [], rangos: [], ordenes: [] };
    consultas.push(q);
    const c = {
      select: () => c,
      eq: (col, val) => { q.filtros.push([col, val]); return c; },
      order: (col) => { q.ordenes.push(col); return c; },
      limit: () => c,
      range: async (a, b) => {
        q.rangos.push([a, b]);
        if (fallos[tabla]) return { data: null, error: fallos[tabla] };
        const filas = (datos[tabla] ?? []).filter((f) => q.filtros.every(([col, val]) => f[col] === val));
        return { data: filas.slice(a, b + 1), error: null };
      },
      then: (ok) => ok({ data: (datos[tabla] ?? []).slice(0, 1), error: null }),
    };
    return c;
  } }) };
  const modulos = {};
  const requireDe = (modoDemo) => (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/demo.js")) return { MODO_DEMO: modoDemo };
    if (name.endsWith("/tiempo-demo.mjs")) return demo;
    if (name.endsWith("/tiempoCalculo.mjs")) return calculo;
    if (name.endsWith("/visitasCalculo.mjs")) return visitasCalculo;
    if (name.endsWith("/supabase")) return supabase;
    if (name === "./leerTiempo") return modulos.tiempo;
    throw new Error(`Import no previsto: ${name}`);
  };
  return { consultas, requireDe, modulos };
}
async function lectores(datos, fallos, modoDemo = false) {
  const ctx = cargar(datos, fallos);
  const ejecutar = async (ruta) => { const exports = {}; vm.runInNewContext(await compilar(ruta), { exports, require: ctx.requireDe(modoDemo), console, Date }); return exports; };
  ctx.modulos.tiempo = await ejecutar("../lib/servidor/leerTiempo.ts");
  const visitas = await ejecutar("../lib/servidor/leerVisitas.ts");
  return { ...ctx, visitas, tiempo: ctx.modulos.tiempo };
}

const SEMANA = "2099-01-05";
const franjas = [{ semana: SEMANA, slot_id: "a", fecha: "2099-01-05", cuenta_zoom: "c1", horario_texto: "Lunes A" },
  { semana: SEMANA, slot_id: "b", fecha: "2099-01-06", cuenta_zoom: "c1", horario_texto: "Martes B" }];
const N = 2300;   // > 2 paginas de 1000: si el lector no pagina, faltan filas en silencio
const personas = Array.from({ length: N }, (_, i) => ({ semana: SEMANA, persona_id: `1000${String(i).padStart(6, "0")}`, nombre: `Estudiante ${i}`,
  ciudad: i % 2 ? "Ciudad X" : "Ciudad Y", slot_id: "a" }));
const vista = [
  ...personas.map((p, i) => ({ semana: SEMANA, sesion_id: "2099-01-06|b", franja_tiempo: "b", fecha: "2099-01-06", persona_id: p.persona_id, nombre: p.nombre,
    ciudad: p.ciudad, es_visita: true, franja_propia: "a", estado_tiempo: i % 3 ? "cumple" : "rojo_tiempo", cumple_50: i % 3 !== 0,
    motivo: null, pct_tiempo: i % 3 ? 70 : 20, segundos: 4200, minutos: 70 })),
  ...personas.slice(0, 50).map((p) => ({ semana: SEMANA, sesion_id: "2099-01-05|a", franja_tiempo: "a", fecha: "2099-01-05", persona_id: p.persona_id, nombre: p.nombre,
    ciudad: p.ciudad, es_visita: false, franja_propia: "a", estado_tiempo: "cumple", cumple_50: true, motivo: null, pct_tiempo: 90, segundos: 5400, minutos: 90 })),
  { semana: "2098-12-29", sesion_id: "2098-12-30|b", franja_tiempo: "b", fecha: "2098-12-30", persona_id: "1000999999", nombre: "Otra semana", ciudad: "Ciudad X",
    es_visita: true, franja_propia: "a", estado_tiempo: "cumple", cumple_50: true, motivo: null, pct_tiempo: 99, segundos: 1, minutos: 1 },
];
const datos = {
  v_asist_tiempo_persona: vista, asist_franjas: franjas, asist_roster: personas,
  asist_tiempo_clase: [{ semana: SEMANA, sesion_id: "2099-01-05|a", slot_id: "a", visitas: 0 }, { semana: SEMANA, sesion_id: "2099-01-06|b", slot_id: "b", visitas: N }],
  asist_no_identificados: [{ semana: SEMANA, sesion_id: "2099-01-06|b", motivo: "sin_correo", cantidad: 12 }],
  asist_semanas: [{ semana: SEMANA, congelada_en: null, cerrada_en: null, estado: "cerrada", notas: null }],
  asist_tiempo_persona_semana: personas.map((p) => ({ semana: SEMANA, persona_id: p.persona_id, estado_tiempo: "cumple", motivo: null, definitivo: true })),
};

// 1) pagina SIEMPRE, filtra por semana y por es_visita en la consulta, y cuadra el total contra asist_tiempo_clase.visitas
{
  const { visitas, consultas } = await lectores(datos);
  const r = await visitas.leerVisitasSemana(SEMANA, {});
  assert.equal(r.visitas.length, N, "las 2300 visitas llegan completas (3 paginas), no 1000");
  const q = consultas.filter((c) => c.tabla === "v_asist_tiempo_persona");
  assert.equal(JSON.stringify(q.flatMap((c) => c.rangos)), JSON.stringify([[0, 999], [1000, 1999], [2000, 2999]]));
  assert.ok(q.every((c) => c.filtros.some(([col, v]) => col === "semana" && v === SEMANA)), "filtra por semana");
  assert.ok(q.every((c) => c.filtros.some(([col, v]) => col === "es_visita" && v === true)), "pide solo es_visita");
  assert.ok(q[0].ordenes.includes("sesion_id") && q[0].ordenes.includes("persona_id"), "orden estable para paginar");
  assert.equal(r.cuadre.estado, "OK", "total de la tabla = asist_tiempo_clase.visitas");
  assert.ok(r.visitas.every((v) => v.fecha >= "2099-01-05"), "ninguna visita de otra semana");
  assert.equal(r.sin_identificar.total, 12);
  assert.equal(r.matriz.celdas.length, 1); assert.equal(r.matriz.celdas[0].n, N);
}

// 2) filtro de ciudad/franja/cuenta
{
  const { visitas } = await lectores(datos);
  const x = await visitas.leerVisitasSemana(SEMANA, { ciudad: "Ciudad X" });
  assert.equal(x.visitas.length, N / 2); assert.ok(x.visitas.every((v) => v.ciudad === "Ciudad X"));
  assert.equal((await visitas.leerVisitasSemana(SEMANA, { cuenta: "c2" })).visitas.length, 0);
}

// 3) la pantalla coincide con el CSV nominal de tiempo (vista=tiempo): mismas filas visita, con y sin filtro
for (const filtro of [{}, { ciudad: "Ciudad Y" }, { franja: "a" }, { cuenta: "c1" }]) {
  const { visitas, tiempo } = await lectores(datos);
  const pantalla = await visitas.leerVisitasSemana(SEMANA, filtro);
  const csv = (await tiempo.listarTiempoNominal(SEMANA, filtro)).filter((f) => f.es_visita);
  const clave = (nombre, propia, visitada, fecha, pct, estado) => [nombre, propia, visitada, fecha, pct ?? "", estado].join("|");
  const dePantalla = pantalla.visitas.map((v) => clave(v.visitante, v.franja_propia, v.franja_visitada, v.fecha, v.pct_tiempo, v.veredicto)).sort();
  const delCsv = csv.map((f) => clave(f.nombre, f.franja, f.franja_tiempo, f.fecha, f.estado_tiempo === "cumple" || f.estado_tiempo === "rojo_tiempo" ? f.pct_tiempo : null, f.estado_tiempo)).sort();
  assert.deepEqual(dePantalla, delCsv, `pantalla = CSV con filtro ${JSON.stringify(filtro)}`);
  if (!filtro.ciudad && !filtro.franja && !filtro.cuenta) {
    const texto = construirCsvTiempo(csv).contenido;
    assert.equal(texto.split("\r\n").filter((l) => l.includes('"SI","2099-01-06"')).length, pantalla.visitas.length, "filas es_visita=SI del archivo = filas de la tabla");
  }
}

// 4) sin tablas -> NO_DISPONIBLE (no rompe); otro error -> se propaga (la ruta responde 503 generico)
{
  const sinTabla = await lectores(datos, { asist_no_identificados: { code: "PGRST205", message: "Could not find the table" } });
  assert.equal(JSON.stringify(await sinTabla.visitas.leerVisitasSemana(SEMANA, {})), JSON.stringify({ disponible: false, motivo: "sin_tablas" }));
  const caida = await lectores(datos, { v_asist_tiempo_persona: { code: "XX000", message: "boom" } });
  await assert.rejects(() => caida.visitas.leerVisitasSemana(SEMANA, {}));
}

// 5) MODO_DEMO: lee del fixture sintetico y no toca Supabase
{
  const { visitas, consultas } = await lectores({}, {}, true);
  const r = await visitas.leerVisitasSemana("2026-09-14", {});
  assert.ok(r.visitas.length > 0 && r.cuadre.estado === "OK");
  assert.equal(consultas.length, 0, "el demo no consulta Supabase");
  await assert.rejects(() => visitas.leerVisitasSemana("1999-01-04", {}), /Sin datos demo/);
}

console.log("RESUMEN: tests=visitas-lector paginacion=2300_filas solo_es_visita=ok cuadre_clase=ok pantalla=csv(4_filtros) degradado=ok demo=ok estado=verde");
