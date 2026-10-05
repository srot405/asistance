// Prueba de integración de lib/servidor/leerPresenciaClase.ts (TS + I/O):
// transpila el módulo real (mismo truco que scripts/test-detalle-route.mjs)
// y mockea únicamente sus fronteras de I/O (cargarBase de Supabase/demo y el
// cliente Supabase), para ejercitar el cableado real entre detalleCalculo.mjs,
// estadoPresencia.mjs, eventosPresenciaDemo.mjs y horarioFranja.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

import * as detalleCalculo from "../lib/detalleCalculo.mjs";
import * as estadoPresencia from "../lib/estadoPresencia.mjs";
import * as eventosDemo from "../lib/eventosPresenciaDemo.mjs";
import * as horarioFranja from "../lib/horarioFranja.mjs";

const source = await readFile(new URL("../lib/servidor/leerPresenciaClase.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

// Fixture pequeño y manual (no el de detalle-demo.mjs): una franja, 4 personas.
// martes 2026-09-15, franja backend-martes-18: 18:00-20:00 COT.
const FRANJA = { slot_id: "s1", fecha: "2026-09-15", cuenta_zoom: "comunicaciones",
  horario_texto: "Martes 18:00", hora_inicio: 18, hora_fin: 20 };
const ROSTER = [
  { persona_id: "p-presente", nombre: "Uno", ciudad: "Bogotá", slot_id: "s1", correo_norm: "uno@ejemplo.test" },
  { persona_id: "p-entrosalio", nombre: "Dos", ciudad: "Bogotá", slot_id: "s1", correo_norm: "dos@ejemplo.test" },
  { persona_id: "p-nuncaentro", nombre: "Tres", ciudad: "Cali", slot_id: "s1", correo_norm: "tres@ejemplo.test" },
  { persona_id: "p-sinevidencia", nombre: "Cuatro", ciudad: "Cali", slot_id: "s1", correo_norm: "cuatro@ejemplo.test" },
];
const SESIONES = [{ sesion_id: "sess1", slot_id: "s1", fecha: "2026-09-15", entradas_totales: 3 }];
const ENTRADAS = [
  { persona_id: "p-presente", sesion_id: "sess1" },
  { persona_id: "p-entrosalio", sesion_id: "sess1" },
  { persona_id: "p-sinevidencia", sesion_id: "sess1" },
];
const CELDAS = [
  { persona_id: "p-presente", estado: "SI" }, { persona_id: "p-entrosalio", estado: "SI" },
  { persona_id: "p-nuncaentro", estado: "NO" }, { persona_id: "p-sinevidencia", estado: "SI" },
];
const base = detalleCalculo.construirBase(ROSTER, [FRANJA], SESIONES, ENTRADAS, CELDAS);

function ejecutar({ modoDemo, zoomLiveLogRows }) {
  const exports = {};
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/detalleCalculo.mjs")) return detalleCalculo;
    if (name.endsWith("/estadoPresencia.mjs")) return estadoPresencia;
    if (name.endsWith("/eventosPresenciaDemo.mjs")) return eventosDemo;
    if (name.endsWith("/horarioFranja.mjs")) return horarioFranja;
    if (name.endsWith("/demo.js")) return { MODO_DEMO: modoDemo };
    if (name.endsWith("/leerDetalleSemana")) return {
      semanaTieneDetalle: async (s) => ["2026-09-14", "2026-09-21"].includes(s),
      cargarBase: async () => base,
    };
    if (name.endsWith("/supabase")) return {
      supabaseServidor: () => ({
        from: () => ({
          select: () => ({
            in: () => ({
              gte: () => ({
                lt: () => Promise.resolve({ data: zoomLiveLogRows ?? [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, console, Map, Set });
  return exports;
}

// ── MODO_DEMO: eventos sintéticos deterministas, nadie queda "sin_evidencia" ──
{
  const { leerPresenciaClase, listarPresenciaNominal } = ejecutar({ modoDemo: true });
  const resultado = await leerPresenciaClase("2026-09-14", "s1");
  assert.equal(resultado.medible, 4, "4 personas medibles (todas SI/NO)");
  assert.equal(resultado.conteos.nunca_entro, 1, "solo p-nuncaentro nunca entró");
  assert.equal(resultado.conteos.presente + resultado.conteos.entro_y_salio, 3, "los otros 3 sí entraron");
  assert.equal(resultado.sin_evidencia, 0, "demo siempre genera eventos para quien entró");
  assert.equal(resultado.fecha, "2026-09-15");
  assert.equal(resultado.horario_texto, "Martes 18:00");

  const nominal = await listarPresenciaNominal("2026-09-14", "s1");
  assert.equal(nominal.length, 4);
  const tres = nominal.find((f) => f.nombre === "Tres");
  assert.equal(tres.estado, "nunca_entro"); assert.equal(tres.minutos, 0);
}

// ── Real (no demo): eventos crudos de zoom_live_log, con un caso "sin evidencia" ──
{
  // p-presente: joined+left cubriendo el 100% de la franja (18:00-20:00 COT
  // = 23:00-01:00 UTC). p-entrosalio: se va a los 10 min (< 70%).
  // p-sinevidencia: entró según asist_entradas pero SIN fila en zoom_live_log.
  const { inicioMs, finMs } = horarioFranja.limitesFranjaMs("2026-09-15", 18, 20);
  const filas = [
    { correo: "UNO@Ejemplo.test", evento: "joined", hora_ms: inicioMs },
    { correo: "uno@ejemplo.test", evento: "left", hora_ms: finMs },
    { correo: "dos@ejemplo.test", evento: "joined", hora_ms: inicioMs },
    { correo: "dos@ejemplo.test", evento: "left", hora_ms: inicioMs + 10 * 60000 },
  ];
  const { leerPresenciaClase, listarPresenciaNominal } = ejecutar({ modoDemo: false, zoomLiveLogRows: filas });
  const resultado = await leerPresenciaClase("2026-09-14", "s1");
  assert.equal(resultado.conteos.presente, 1, "Uno: 100% de la franja -> presente");
  assert.equal(resultado.conteos.entro_y_salio, 2, "Dos (10 min) + Cuatro (sin evidencia) -> entro_y_salio");
  assert.equal(resultado.conteos.nunca_entro, 1);
  assert.equal(resultado.sin_evidencia, 1, "Cuatro entró según asist_entradas pero sin fila en zoom_live_log");

  const nominal = await listarPresenciaNominal("2026-09-14", "s1");
  const cuatro = nominal.find((f) => f.nombre === "Cuatro");
  assert.equal(cuatro.estado, "entro_y_salio");
  assert.equal(cuatro.minutos, null, "sin evidencia: no se inventan minutos");
  const uno = nominal.find((f) => f.nombre === "Uno");
  assert.equal(uno.estado, "presente", "correo en mayúsculas normaliza igual");
}

console.log("RESUMEN: tests=presencia-clase demo=si real=si sin_evidencia=cubierto estado=verde");
