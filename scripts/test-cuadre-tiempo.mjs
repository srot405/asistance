import assert from "node:assert/strict";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";
import { calcularResumen, construirBase } from "../lib/detalleCalculo.mjs";
import { TIEMPO_DEMO, TIEMPO_DEMO_SERIE } from "../lib/tiempo-demo.mjs";
import { armarSerieTiempo, armarTiempoSemana, compararConBackend, normalizarClaseBackend, normalizarResumenPersonas } from "../lib/tiempoCalculo.mjs";
import { cuadreTiempo, sumarConteos } from "../lib/tiempoVista.mjs";

const SEMANAS = Object.keys(DETALLE_DEMO_BASE);
assert.deepEqual(Object.keys(TIEMPO_DEMO), SEMANAS, "el demo de tiempo cubre las mismas semanas Detalle que el demo del detalle");

for (const semana of SEMANAS) {
  const d = TIEMPO_DEMO[semana];
  const r = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila) } });
  // 1) suma de clases = semana (pooled) y cada fila cuadra
  const suma = sumarConteos(r.por_clase);
  for (const k of ["n_ingresaron", "n_medibles", "n_cumplen", "n_rojo", "n_sin_dato", "n_pendiente"])
    assert.equal(suma[k], r.semana_agregada[k], `${semana}: suma de clases = semana en ${k}`);
  assert.equal(r.por_dia.reduce((a, x) => a + x.n_ingresaron, 0), r.semana_agregada.n_ingresaron, `${semana}: suma de dias = semana`);
  assert.equal(r.cuadre.ok, true, `${semana}: ${r.cuadre.errores.join("|")}`);
  for (const c of [...r.por_clase, ...r.por_dia, r.semana_agregada]) assert.equal(cuadreTiempo(c).ok, true);
  // 2) cuadre con el backend (agregado por clase vs filas por persona)
  assert.equal(r.cuadre_backend.estado, "OK", `${semana}: ${r.cuadre_backend.detalle.join("|")}`);
  // 3) MISMO conjunto de "ingresaron" que el resto del panel (detalle de la semana)
  const base = DETALLE_DEMO_BASE[semana];
  const detalle = calcularResumen(base.roster, construirBase(base.roster, base.franjas, base.sesiones, base.entradas, base.celdas));
  const medibles = base.sesiones.filter((s) => (s.entradas_totales ?? 0) > 0).length > 0;
  if (medibles) assert.equal(r.semana_agregada.n_ingresaron, base.celdas.filter((c) => c.estado === "SI").length, `${semana}: ingresaron = celdas SI`);
  if (semana !== "2026-09-28") assert.equal(r.semana_agregada.n_ingresaron, detalle.asistieron, `${semana}: n_ingresaron del tiempo = asistieron del detalle`);
  // 4) la serie (v_asist_tiempo_semana) coincide con la suma de clases de esa semana
  const serie = armarSerieTiempo(TIEMPO_DEMO_SERIE).find((s) => s.semana === semana);
  assert.equal(serie.n_ingresaron, r.semana_agregada.n_ingresaron);
  assert.equal(serie.n_medibles, r.semana_agregada.n_medibles);
  assert.equal(serie.n_cumplen, r.semana_agregada.n_cumplen);
  // 5) veredicto semanal por persona (otra lente): cuadra con el roster y la cobertura "N de M"
  const p = r.semana_personas;
  assert.equal(p.cumplen + p.rojo + p.sin_dato + p.ausentes + p.sin_clase + p.pendientes, p.roster, `${semana}: lente semanal suma el roster`);
  assert.equal(p.medidos, p.cumplen + p.rojo);
  // 6) sin PII en la respuesta serializada
  const json = JSON.stringify(r);
  for (const prohibido of ['"nombre"', '"persona_id"', '"correo"', "Persona Demo", "@"]) assert.equal(json.includes(prohibido), false, `${semana}: sin ${prohibido}`);
}

// Escenarios obligatorios
const s14 = TIEMPO_DEMO["2026-09-14"], s21 = TIEMPO_DEMO["2026-09-21"], s28 = TIEMPO_DEMO["2026-09-28"];
assert.equal(s14.info.provisional, false);
assert.equal(s28.info.provisional, true, "semana abierta = provisional");
const r21 = armarTiempoSemana({ clases: s21.clases, personas: s21.personas, franjas: s21.franjas, info: s21.info });
const mi = r21.por_clase.find((c) => c.slot_id === "backend-miércoles-18");
assert.equal(mi.n_ingresaron > 0 && mi.n_medibles === 0, true, "clase ENTERA sin medicion");
assert.equal(mi.sin_medicion, true);
assert.equal(r21.semana_agregada.nivel_cobertura, "baja", "semana con cobertura baja");
const r28 = armarTiempoSemana({ clases: s28.clases, personas: s28.personas, franjas: s28.franjas, info: s28.info });
const pendientes = r28.por_clase.filter((c) => c.n_ingresaron === 0);
assert.ok(pendientes.length >= 10 && pendientes.every((c) => c.cobertura === null && c.sin_ingresos), "cobertura 0: clases sin ingresos, sin 0 % inventado");

// Una tabla de clase alterada en 1 => DISCREPA
const alterada = s14.clases.map((c, i) => (i === 0 ? { ...c, n_rojo: c.n_rojo + 1, n_medibles: c.n_medibles + 1 } : c)).map(normalizarClaseBackend);
assert.equal(compararConBackend(s14.personas, alterada).estado, "DISCREPA");
console.log("RESUMEN: cuadre_tiempo=ok clases_suman_semana=ok vs_detalle=ok vs_backend=ok escenarios=6 pii=ausente estado=verde");
