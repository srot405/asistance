import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agregarDatos, crearCorteVisual } from "../lib/agregados.ts";
import { semanaActualCOT } from "../lib/conteos.ts";

const raw = JSON.parse(await readFile(new URL("../data/demo/semana-2026-09-14.json", import.meta.url), "utf8"));
const d = agregarDatos(raw);
assert.equal(d.semana_registrada, true);
assert.equal(d.franjas_con_clase.length, 2);
assert.equal(d.participantes.length, d.resumen.roster);
assert.equal(d.dias_visibles.reduce((n, x) => n + x.noIngresaron, 0), d.participantes.filter((p) => !p.propia).length);
assert.equal(d.dias_visibles.reduce((n, x) => n + x.rescataron, 0), d.participantes.filter((p) => !p.propia && p.rescatada).length);
assert.equal(d.dias_visibles.reduce((n, x) => n + x.sinIngresarHastaHoy, 0), d.participantes.filter((p) => !p.propia && !p.rescatada).length);
assert.equal(d.participantes.some((p) => p.nombre), false);
const verificarCorte = (corte, etiqueta) => {
  assert.equal(new Set(corte.participantes.map((p) => p.key)).size, corte.participantes.length, `${etiqueta}: una ficha por persona`);
  assert.equal(corte.sinIngresarHastaHoy, corte.faltantes.length, `${etiqueta}: encabezado = lista Faltaron`);
  assert.equal(corte.noIngresaron, corte.rescataron + corte.sinIngresarHastaHoy, `${etiqueta}: resta exacta`);
  assert.equal(corte.grupos.reduce((n, g) => n + g.participantes.length, 0), corte.participantes.length, `${etiqueta}: grupos = fichas`);
  assert.equal(corte.grupos_faltantes.reduce((n, g) => n + g.participantes.length, 0), corte.faltantes.length, `${etiqueta}: grupos faltantes = lista`);
};
verificarCorte(crearCorteVisual(d.participantes, d.franjas_con_clase), "toda la semana");
for (const resumenDia of d.dias_visibles) {
  const corte = crearCorteVisual(d.participantes, d.franjas_con_clase, { fecha: resumenDia.fecha });
  verificarCorte(corte, resumenDia.fecha);
  assert.deepEqual({ noIngresaron: corte.noIngresaron, rescataron: corte.rescataron,
    sinIngresarHastaHoy: corte.sinIngresarHastaHoy }, {
    noIngresaron: resumenDia.noIngresaron, rescataron: resumenDia.rescataron,
    sinIngresarHastaHoy: resumenDia.sinIngresarHastaHoy,
  });
}
assert.equal(semanaActualCOT(new Date("2026-09-28T13:00:00Z")), "2026-09-28");

const noClase = agregarDatos({ semana: "2026-09-28", roster: [], franjas: [], entradas: [], celdas_dia: [], celdas_semana: [], no_identificados: [] });
assert.equal(noClase.franjas_con_clase.length, 0);
assert.equal(noClase.resumen.roster, 0);
assert.equal(noClase.semana_registrada, true);
const mixed = agregarDatos({ semana: "2026-09-28",
  roster: ["real", "rescate", "faltante", "sin-evento", "soporte"].map((persona_id, i) => ({ persona_id, slot_id: ["real", "rescate", "real", "sin-evento", "soporte"][i], ciudad: "Demo", nombre: i === 0 ? "Alfa Beta Gamma Delta" : `Prueba ${i}` })),
  franjas: [
    { slot_id: "real", fecha: "2026-09-28", estado_captura: "capturada", cuenta_zoom: "comunicaciones", roster_n: 2, entradas_totales: 2, sesion_id: "session-real" },
    { slot_id: "rescate", fecha: "2026-09-28", estado_captura: "capturada", cuenta_zoom: "jovenescreativos", roster_n: 1, entradas_totales: 1, sesion_id: "session-rescate" },
    { slot_id: "sin-evento", fecha: "2026-09-29", estado_captura: "capturada", cuenta_zoom: "comunicaciones", roster_n: 1, entradas_totales: 0, sesion_id: "session-empty" },
    { slot_id: "soporte", fecha: "2026-09-30", estado_captura: "zoom_limit_pendiente", cuenta_zoom: "soporte", captura_automatica: false, roster_n: 1, sesion_id: "session-support" },
  ], entradas: [{ persona_id: "real", sesion_id: "session-real" }, { persona_id: "rescate", sesion_id: "session-real" }],
  celdas_dia: [], celdas_semana: [{ persona_id: "real", estado: "SI" }, { persona_id: "rescate", estado: "NO" }, { persona_id: "faltante", estado: "NO" }], no_identificados: [],
}, { incluirNombres: true });
assert.deepEqual(mixed.por_dia.map((x) => x.fecha), ["2026-09-28"]);
assert.deepEqual(mixed.franjas_con_clase.map((x) => x.slot_id), ["real", "rescate"]);
assert.equal(mixed.resumen.roster, 3);
assert.deepEqual(mixed.dias_visibles[0], { fecha: "2026-09-28", noIngresaron: 2, rescataron: 1, sinIngresarHastaHoy: 1 });
assert.equal(mixed.participantes.find((p) => p.franja === "rescate").estado_por_franja.rescate, "A");
assert.deepEqual(mixed.faltantes_por_franja.find((slot) => slot.slot_id === "real").participantes.map((p) => p.key), ["persona-3"]);
assert.equal(mixed.participantes.find((p) => p.key === "persona-1").nombre, "Alfa Gamma");
verificarCorte(crearCorteVisual(mixed.participantes, mixed.franjas_con_clase), "sintético semana");
verificarCorte(crearCorteVisual(mixed.participantes, mixed.franjas_con_clase, { fecha: "2026-09-28" }), "sintético día");
console.log(`RESUMEN: visual_dias=${d.dias_visibles.length} roster=${d.participantes.length} clases_activas=${d.franjas_con_clase.length} semana_actual=${semanaActualCOT(new Date("2026-09-28T13:00:00Z"))} estado=verde`);
