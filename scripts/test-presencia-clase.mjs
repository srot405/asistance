// Prueba de integración de lib/servidor/leerPresenciaClase.ts (TS + I/O) tras TOC-146 (criterio unico del 50 %):
// transpila el módulo real (mismo truco que scripts/test-detalle-route.mjs) y mockea únicamente sus fronteras de I/O
// (cargarBase y leerTiempoPersonasClase), para ejercitar el cableado real con detalleCalculo.mjs y presenciaTiempo.mjs.
// La presencia ya NO lee zoom_live_log ni usa el 70 %: se deriva del veredicto guardado por el backend.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

import * as detalleCalculo from "../lib/detalleCalculo.mjs";
import * as presenciaTiempo from "../lib/presenciaTiempo.mjs";

const source = await readFile(new URL("../lib/servidor/leerPresenciaClase.ts", import.meta.url), "utf8");
assert.doesNotMatch(source, /zoom_live_log|UMBRAL_PRESENTE|0\.70|70 %/, "la presencia no usa eventos crudos ni el 70 %");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

// Fixture pequeño y manual (datos sintéticos): una franja, 5 personas. martes 2026-09-15, franja s1.
const FRANJA = { slot_id: "s1", fecha: "2026-09-15", cuenta_zoom: "comunicaciones",
  horario_texto: "Martes 18:00", hora_inicio: 18, hora_fin: 20 };
const ROSTER = [
  { persona_id: "1000000001", nombre: "Uno", ciudad: "Bogotá", slot_id: "s1", correo_norm: "uno@ejemplo.test" },
  { persona_id: "1000000002", nombre: "Dos", ciudad: "Bogotá", slot_id: "s1", correo_norm: "dos@ejemplo.test" },
  { persona_id: "1000000003", nombre: "Tres", ciudad: "Cali", slot_id: "s1", correo_norm: "tres@ejemplo.test" },
  { persona_id: "1000000004", nombre: "Cuatro", ciudad: "Cali", slot_id: "s1", correo_norm: "cuatro@ejemplo.test" },
  { persona_id: "1000000005", nombre: "Cinco", ciudad: "Cali", slot_id: "s1", correo_norm: "cinco@ejemplo.test" },
];
const SESIONES = [{ sesion_id: "sess1", slot_id: "s1", fecha: "2026-09-15", entradas_totales: 4 }];
const ENTRADAS = ["1000000001", "1000000002", "1000000004", "1000000005"].map((persona_id) => ({ persona_id, sesion_id: "sess1" }));
const CELDAS = [
  { persona_id: "1000000001", estado: "SI" }, { persona_id: "1000000002", estado: "SI" },
  { persona_id: "1000000003", estado: "NO" }, { persona_id: "1000000004", estado: "SI" }, { persona_id: "1000000005", estado: "SI" },
];
const base = detalleCalculo.construirBase(ROSTER, [FRANJA], SESIONES, ENTRADAS, CELDAS);

// Veredictos guardados por el backend: Uno cumple (exactamente 50), Dos rojo (49,9), Cuatro sin dato, Cinco sin fila de tiempo.
const TIEMPO = new Map([
  ["1000000001", { estado_tiempo: "cumple", pct_tiempo: 50, cumple_50: true, minutos: 60 }],
  ["1000000002", { estado_tiempo: "rojo_tiempo", pct_tiempo: 49.9, cumple_50: false, minutos: 59.9 }],
  ["1000000004", { estado_tiempo: "sin_dato_tiempo", pct_tiempo: null, cumple_50: null, minutos: null }],
]);

function ejecutar(tiempo) {
  const exports = {};
  const consultas = [];
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/detalleCalculo.mjs")) return detalleCalculo;
    if (name.endsWith("/presenciaTiempo.mjs")) return presenciaTiempo;
    if (name.endsWith("/leerTiempo")) return { leerTiempoPersonasClase: async (semana, slot) => { consultas.push([semana, slot]); return tiempo; } };
    if (name.endsWith("/leerDetalleSemana")) return {
      semanaTieneDetalle: async (s) => ["2026-09-14", "2026-09-21"].includes(s),
      cargarBase: async () => base,
    };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, console, Map, Set });
  return { ...exports, consultas };
}

// ── Con tiempos: Presente / Parcial / Nunca entró / Sin dato ──
{
  const { leerPresenciaClase, listarPresenciaNominal, consultas } = ejecutar(TIEMPO);
  const r = await leerPresenciaClase("2026-09-14", "s1");
  assert.deepEqual({ ...r.conteos }, { presente: 1, parcial: 1, nunca_entro: 1, sin_dato: 2 },
    "Uno=presente (50 % cumple), Dos=parcial (<50 %), Tres=nunca, Cuatro y Cinco=sin dato");
  assert.equal(r.medible, 5);
  assert.equal(r.conteos.presente + r.conteos.parcial + r.conteos.nunca_entro + r.conteos.sin_dato, r.medible, "las 4 categorias cuadran con los medibles");
  assert.equal(r.fecha, "2026-09-15");
  assert.equal(r.horario_texto, "Martes 18:00");
  assert.deepEqual(consultas[0], ["2026-09-14", "s1"], "lee el tiempo de ESA clase");
  assert.ok(!("sin_evidencia" in r), "ya no existe sin_evidencia");

  const nominal = await listarPresenciaNominal("2026-09-14", "s1");
  const por = (n) => nominal.find((f) => f.nombre === n);
  assert.equal(nominal.length, 5);
  assert.equal(por("Uno").estado, "presente"); assert.equal(por("Uno").cumple_50, true); assert.equal(por("Uno").minutos, 60);
  assert.equal(por("Dos").estado, "parcial"); assert.equal(por("Dos").cumple_50, false);
  assert.equal(por("Tres").estado, "nunca_entro"); assert.equal(por("Tres").minutos, null, "sin minutos inventados");
  assert.equal(por("Cuatro").estado, "sin_dato"); assert.equal(por("Cuatro").pct_tiempo, null);
  assert.equal(por("Cinco").estado, "sin_dato", "entró pero sin fila de tiempo: sin dato, nunca Parcial");
  assert.deepEqual(nominal.map((f) => f.nombre), [...nominal.map((f) => f.nombre)].sort((a, b) => a.localeCompare(b)), "orden por nombre");
}

// ── Sin tablas/tiempos (mapa vacio): quien entró queda sin dato, nunca Parcial ni Presente ──
{
  const { leerPresenciaClase } = ejecutar(new Map());
  const r = await leerPresenciaClase("2026-09-14", "s1");
  assert.deepEqual({ ...r.conteos }, { presente: 0, parcial: 0, nunca_entro: 1, sin_dato: 4 });
}

console.log("RESUMEN: tests=presencia-clase criterio=50pct sin_zoom_live_log=si sin_dato=cubierto estado=verde");
