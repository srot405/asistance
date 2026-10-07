// lib/estadisticasCalculo.mjs (TOC-150): filtrado, seleccion de nivel, supresion n<5, tendencia y que NUNCA se sume ciudad_dia para
// inventar un total. Datos 100 % sinteticos; el demo se arma como la base (suma antes de suprimir) y sirve de segundo calculo.
import assert from "node:assert/strict";
import { ESTADISTICAS_DEMO, SERIE_DEMO, construirCortesDemo } from "../lib/estadisticas-demo.mjs";
import * as E from "../lib/estadisticasCalculo.mjs";

const F = (o = {}) => ({ ...E.FILTROS_VACIOS, ...o });
const datos = (semana) => ({ disponible: true, semana, materia: "X", ...ESTADISTICAS_DEMO[semana], serie: SERIE_DEMO });
const d14 = datos("2026-09-14");

// 1) el demo cuadra por construccion: cada nivel publicado = suma de las clases crudas (se comprueba con las filas NO suprimidas)
{
  const noSup = (n) => !n.suprimido;
  const semana = d14.niveles.find((n) => n.nivel === "semana");
  assert.equal(semana.suprimido, false);
  const porCiudad = d14.niveles.filter((n) => n.nivel === "ciudad" && noSup(n));
  assert.equal(porCiudad.reduce((a, n) => a + n.roster, 0), semana.roster, "suma de ciudades = semana (todas publicadas)");
  const porDia = d14.niveles.filter((n) => n.nivel === "dia");
  assert.equal(porDia.reduce((a, n) => a + n.roster, 0), semana.roster, "suma de dias = semana");
  // pero ciudad_dia SI trae celdas suprimidas (Quibdo): sumarlas daria menos que el total publicado
  const cd = d14.niveles.filter((n) => n.nivel === "ciudad_dia");
  assert.ok(cd.some((n) => n.suprimido), "el demo incluye celdas suprimidas");
  assert.ok(cd.filter(noSup).reduce((a, n) => a + n.roster, 0) < semana.roster, "sumar celdas visibles NO reproduce el total");
}

// 2) nivel segun filtros
assert.equal(E.nivelParaFiltros(F()), "semana");
assert.equal(E.nivelParaFiltros(F({ dia: "lunes" })), "dia");
assert.equal(E.nivelParaFiltros(F({ ciudad: "Cali" })), "ciudad");
assert.equal(E.nivelParaFiltros(F({ ciudad: "Cali", dia: "lunes" })), "ciudad_dia");
assert.equal(E.nivelParaFiltros(F({ cuenta: "soporte" })), "semana", "los filtros de clase no cambian el nivel");

// 3) tarjetas: salen del nivel publicado, no de sumar
{
  const fila = (n, ciudad, dia) => d14.niveles.find((x) => x.nivel === n && (ciudad === undefined || x.ciudad === ciudad) && (dia === undefined || x.dia === dia));
  for (const [f, nivel, ciudad, dia] of [[F(), "semana"], [F({ dia: "martes" }), "dia", undefined, "martes"], [F({ ciudad: "Cali" }), "ciudad", "Cali"],
    [F({ ciudad: "Cali", dia: "sabado" }), "ciudad_dia", "Cali", "sabado"]]) {
    const c = E.cifrasDelCorte(d14, f);
    assert.equal(c.fuente, "nivel"); assert.equal(c.nivel, nivel);
    assert.equal(c.cifras.roster, fila(nivel, ciudad, dia).roster, nivel);
    assert.equal(c.cifras.no_medibles, fila(nivel, ciudad, dia).no_medibles, "no medibles va aparte");
  }
  // ciudad con otra grafia / sin tilde / mayusculas
  assert.equal(E.cifrasDelCorte(d14, F({ ciudad: "BOGOTA" })).cifras.roster, fila("ciudad", "Bogotá").roster, "ciudad normalizada");
  assert.equal(E.cifrasDelCorte(d14, F({ ciudad: "Cali", dia: "miércoles" })).cifras?.roster ?? null,
    fila("ciudad_dia", "Cali", "miercoles").suprimido ? null : fila("ciudad_dia", "Cali", "miercoles").roster, "dia con tilde");
  assert.equal(E.cifrasDelCorte(d14, F({ ciudad: "Narnia" })).fuente, "ninguna");
}

// 4) supresion en niveles y en clases (fixture a mano)
{
  const z = { roster: null, entraron_a_su_clase: null, fueron_a_otra: null, no_aparecieron: null, no_medibles: null, visitas_recibidas: null };
  const v = (roster, ent, otra, aus, nm, vis) => ({ suprimido: false, roster, entraron_a_su_clase: ent, fueron_a_otra: otra, no_aparecieron: aus, no_medibles: nm, visitas_recibidas: vis });
  const niveles = [
    { semana: "s", nivel: "semana", ciudad: null, dia: null, ...v(30, 20, 3, 5, 2, 4) },
    { semana: "s", nivel: "ciudad", ciudad: "A", dia: null, ...v(22, 15, 2, 4, 1, 3) },
    { semana: "s", nivel: "ciudad", ciudad: "B", dia: null, ...v(8, 5, 1, 1, 1, 1) },
    { semana: "s", nivel: "dia", ciudad: null, dia: "lunes", ...v(30, 20, 3, 5, 2, 4) },
    { semana: "s", nivel: "ciudad_dia", ciudad: "A", dia: "lunes", ...v(22, 15, 2, 4, 1, 3) },
    { semana: "s", nivel: "ciudad_dia", ciudad: "B", dia: "lunes", suprimido: true, ...z },
  ];
  const clases = [
    { semana: "s", ciudad: "A", slot_id: "c1", dia: "lunes", fecha: "2026-09-14", hora_inicio: 18, hora_fin: 20, cuenta_zoom: "soporte", tipo: "virtual", estado_captura: "capturada", suprimido: false, mediana_pct_tiempo: 71.5, ...v(10, 7, 1, 2, 0, 1) },
    { semana: "s", ciudad: "A", slot_id: "c2", dia: "lunes", fecha: "2026-09-14", hora_inicio: 20, hora_fin: 22, cuenta_zoom: "soporte", tipo: "virtual", estado_captura: "zoom_limit_pendiente", suprimido: false, mediana_pct_tiempo: null, ...v(12, 8, 1, 2, 1, 2) },
    { semana: "s", ciudad: "B", slot_id: "c1", dia: "lunes", fecha: "2026-09-14", hora_inicio: 18, hora_fin: 20, cuenta_zoom: "comunicaciones", tipo: "presencial", estado_captura: "capturada", suprimido: true, mediana_pct_tiempo: null, ...z },
  ];
  const d = { disponible: true, semana: "s", materia: "M", niveles, clases, serie: niveles };
  // celda suprimida: «<5», no 0; el total de B sigue siendo el publicado por el nivel 'ciudad'
  const t = E.tablaCiudadDia(d, F());
  const filaB = t.filas.find((f) => f.ciudad === "B");
  assert.equal(filaB.celdas[0].estado, "suprimida"); assert.equal(filaB.celdas[0].cifras, undefined);
  assert.equal(filaB.total.cifras.roster, 8, "el total de ciudad viene del nivel, no de sumar celdas (que darian 0)");
  assert.equal(t.totalesDia[0].cifras.roster, 30); assert.equal(t.totalSemana.cifras.roster, 30);
  assert.equal(E.cifrasDelCorte(d, F({ ciudad: "B", dia: "lunes" })).suprimido, true);
  assert.equal(E.cifrasDelCorte(d, F({ ciudad: "B", dia: "lunes" })).cifras, null);
  // filtro de clase: se suma SOLO si ninguna clase esta suprimida
  assert.equal(E.cifrasDelCorte(d, F({ ciudad: "A", cuenta: "soporte" })).cifras.roster, 22);
  assert.equal(E.cifrasDelCorte(d, F({ ciudad: "A", cuenta: "soporte" })).fuente, "clases");
  const mixto = E.cifrasDelCorte(d, F({ dia: "lunes", tipo: "presencial" }));
  assert.equal(mixto.suprimido, true); assert.equal(mixto.cifras, null, "con una clase suprimida no se publica total sumado");
  assert.equal(E.cifrasDelCorte(d, F({ cuenta: "nadie" })).fuente, "ninguna");
  // tabla de clases: chip de captura + mediana; suprimida sin cifras ni mediana
  const tc = E.tablaClases(d, F());
  assert.equal(tc.length, 3);
  assert.equal(tc.find((c) => c.slot_id === "c2").confianza, "zoom_limit");
  assert.equal(tc.find((c) => c.slot_id === "c1" && c.ciudad === "A").mediana, 71.5);
  const sup = tc.find((c) => c.ciudad === "B"); assert.equal(sup.suprimido, true); assert.equal(sup.cifras, null); assert.equal(sup.mediana, null);
  assert.equal(E.filtrarClases(clases, F({ tipo: "presencial" })).length, 1);
  assert.equal(E.filtrarClases(clases, F({ ciudad: "a" })).length, 2);
  // pct sobre MEDIBLES: no medibles no cuentan como falta
  assert.equal(E.pctEntro({ roster: 12, entraron_a_su_clase: 8, no_medibles: 2 }), 80);
  assert.equal(E.pctEntro({ roster: 3, entraron_a_su_clase: 0, no_medibles: 3 }), null, "sin medibles no hay %");
  assert.equal(E.pctEntro({ roster: null, entraron_a_su_clase: null }), null);
  assert.equal(E.semaforo(80), "verde"); assert.equal(E.semaforo(79.9), "amarillo"); assert.equal(E.semaforo(59.9), "rojo"); assert.equal(E.semaforo(null), "sin_dato");
  // barras
  const barras = E.barrasCiudades(d, F());
  assert.equal(barras.find((b) => b.ciudad === "A").estado, "ok");
  const barrasDia = E.barrasCiudades(d, F({ dia: "lunes" }));
  assert.equal(barrasDia.find((b) => b.ciudad === "B").estado, "suprimida", "con dia usa ciudad_dia: B suprimida");
  assert.equal(barrasDia.find((b) => b.ciudad === "B").pct, null);
  // CSV agregado
  const csv = E.construirCsvEstadisticas(d, F());
  assert.ok(csv.contenido.startsWith("﻿")); assert.match(csv.contenido, /\r\n$/);
  assert.match(csv.contenido, /"LEYENDA"/); assert.match(csv.contenido, /"SUPRESION"/);
  const filasB = csv.contenido.split("\r\n").filter((l) => l.includes('"B"') && (l.startsWith('"CIUDAD_DIA"') || l.startsWith('"CLASE"')));
  assert.ok(filasB.length >= 2); for (const l of filasB) { assert.match(l, /"<5"/); assert.equal(/,"0",/.test(l), false, "suprimida no es 0"); }
  assert.equal(/null|undefined/.test(csv.contenido), false);
  const raro = E.construirCsvEstadisticas({ ...d, materia: "=HYPERLINK(x)" }, F());
  assert.match(raro.contenido, /"'=HYPERLINK\(x\)"/, "formula neutralizada");
}

// 5) tendencia: huecos, nunca 0
{
  const serie = [
    { semana: "2026-09-07", nivel: "ciudad", ciudad: "A", dia: null, suprimido: false, roster: 10, entraron_a_su_clase: 8, no_medibles: 0 },
    { semana: "2026-09-14", nivel: "ciudad", ciudad: "A", dia: null, suprimido: true, roster: null, entraron_a_su_clase: null, no_medibles: null },
    { semana: "2026-09-21", nivel: "ciudad", ciudad: "A", dia: null, suprimido: false, roster: 10, entraron_a_su_clase: 5, no_medibles: 0 },
    { semana: "2026-09-21", nivel: "ciudad", ciudad: "B", dia: null, suprimido: false, roster: 6, entraron_a_su_clase: 3, no_medibles: 0 },
    { semana: "2026-09-21", nivel: "dia", ciudad: null, dia: "lunes", suprimido: false, roster: 16, entraron_a_su_clase: 8, no_medibles: 0 },
  ];
  const t = E.tendenciaPorCiudad(serie, F());
  assert.deepEqual(t.semanas, ["2026-09-07", "2026-09-14", "2026-09-21"]);
  assert.deepEqual(t.series.map((s) => s.ciudad), ["A", "B"], "solo nivel ciudad");
  const a = t.series[0].puntos; assert.deepEqual(a.map((p) => p.pct), [80, null, 50]); assert.equal(a[1].estado, "suprimida");
  const b = t.series[1].puntos; assert.equal(b[0].estado, "vacia"); assert.equal(b[0].pct, null); assert.equal(b[2].pct, 50);
  assert.deepEqual(E.tendenciaPorCiudad(serie, F({ ciudad: "b" })).series.map((s) => s.ciudad), ["B"]);
  assert.deepEqual(E.tendenciaPorCiudad([], F()).series, []);
}

// 6) opciones, ordenes y vacios
{
  const op = E.opcionesFiltros(d14);
  assert.deepEqual(op.dias, ["lunes", "martes", "miercoles", "jueves", "sabado"], "dias en orden de calendario");
  assert.ok(op.ciudades.includes("Bogotá") && op.cuentas.includes("soporte") && op.tipos.includes("presencial"));
  assert.match(E.explicarVacio(null, F()), /todavía no tiene cortes/);
  assert.match(E.explicarVacio(d14, F({ ciudad: "x" })), /filtros/);
  const csv = E.construirCsvEstadisticas(d14, F({ ciudad: "Cali" }));
  assert.equal(csv.contenido.includes('"Bogotá"'), false, "el CSV respeta el corte visible");
  assert.match(csv.contenido, /ciudad=Cali/);
  // semana abierta: clases por ocurrir -> no medibles aparte, sin % inventado
  const d28 = datos("2026-09-28"); const porOcurrir = E.tablaClases(d28, F()).filter((c) => c.confianza === "por_ocurrir");
  assert.ok(porOcurrir.length > 0 && porOcurrir.every((c) => c.suprimido || c.pct === null));
}
// la fabrica demo es determinista
assert.deepEqual(construirCortesDemo("2026-09-14"), construirCortesDemo("2026-09-14"));

console.log("RESUMEN: estadisticas_calculo niveles=4 total_desde_vista=ok sin_sumar_ciudad_dia=ok suprimida=<5 no_medibles_aparte=ok tendencia_huecos=ok csv_agregado=ok estado=verde");
