import assert from "node:assert/strict";
import { puntosTendenciaTiempo, tramosTendenciaTiempo } from "../lib/tendenciaTiempo.mjs";

const res = (semana, nivel = "Detalle") => ({ semana, materia: "M", nivel });
const s = (semana, o = {}) => ({ semana, roster: 700, n_ingresaron: 100, n_medibles: 100, n_cumplen: 80, n_rojo: 20, n_sin_dato: 0, n_pendiente: 0,
  cobertura: 1, provisional: false, ...o });

// 1) semana con n_medibles=0 no es graficable y CORTA el tramo; nunca 0 %
const resultados = [res("2026-08-31", "Solo semanal"), res("2026-09-07"), res("2026-09-14"), res("2026-09-21"), res("2026-09-28"), res("2026-10-05")];
const serie = [s("2026-09-07"), s("2026-09-14", { n_medibles: 0, n_cumplen: 0, n_rojo: 0, n_sin_dato: 100, cobertura: 0 }),
  s("2026-09-21", { n_ingresaron: 100, n_medibles: 50, n_cumplen: 40, n_rojo: 10, cobertura: 0.5 }), s("2026-09-28")];
const puntos = puntosTendenciaTiempo(resultados, serie);
assert.deepEqual(puntos.map((p) => p.semana), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"], "Solo semanal sin fila se omite; Detalle sin fila queda como hueco");
const por = Object.fromEntries(puntos.map((p) => [p.semana, p]));
assert.equal(por["2026-09-14"].graficable, false);
assert.equal(por["2026-09-14"].valor, null, "nada de 0 % inventado");
assert.equal(por["2026-10-05"].tieneFila, false);
assert.equal(por["2026-10-05"].graficable, false, "Detalle sin tiempos = hueco");
assert.equal(por["2026-10-05"].sinTiempos, true);
const tramos = tramosTendenciaTiempo(puntos);
assert.deepEqual(tramos.map((t) => t.map((p) => p.semana)), [["2026-09-07"], ["2026-09-21", "2026-09-28"]], "el hueco corta el tramo");

// 2) cada barra divide por SU propia base (regresion: dividir por el roster de la semana abierta)
assert.equal(por["2026-09-21"].valor, 80, "40 de 50 medidos = 80 %, no 40 de 100 ingresaron ni de 700 de roster");
assert.equal(por["2026-09-07"].valor, 80);
assert.equal(por["2026-09-21"].n_medibles, 50);
assert.equal(por["2026-09-21"].n_ingresaron, 100);
const roster2 = puntosTendenciaTiempo([res("2026-09-07"), res("2026-09-14")], [s("2026-09-07", { roster: 500, n_cumplen: 30, n_medibles: 60, n_ingresaron: 60 }),
  s("2026-09-14", { roster: 900, n_cumplen: 30, n_medibles: 40, n_ingresaron: 40 })]);
assert.deepEqual(roster2.map((p) => p.valor), [50, 75], "el roster de cada semana no entra en la barra");

// 3) cobertura < 0.70 marcada; semana abierta PROVISIONAL en tramo propio, no unida a las cerradas
assert.equal(por["2026-09-21"].nivelCobertura, "baja");
assert.equal(por["2026-09-28"].nivelCobertura, "ok");
const conAbierta = puntosTendenciaTiempo([res("2026-09-21"), res("2026-09-28"), res("2026-10-05")],
  [s("2026-09-21"), s("2026-09-28"), s("2026-10-05", { provisional: true, n_ingresaron: 30, n_medibles: 29, n_cumplen: 24, n_rojo: 5 })]);
assert.equal(conAbierta[2].provisional, true);
assert.deepEqual(tramosTendenciaTiempo(conAbierta).map((t) => t.map((p) => p.semana)), [["2026-09-21", "2026-09-28"], ["2026-10-05"]]);
// 4) orden cronologico respetando resultados; sin serie => todo hueco sin 0
const sinSerie = puntosTendenciaTiempo([res("2026-09-14"), res("2026-09-21")], []);
assert.ok(sinSerie.every((p) => p.valor === null && !p.graficable));
assert.deepEqual(tramosTendenciaTiempo(sinSerie), []);
console.log("RESUMEN: tendencia_tiempo=ok hueco_no_cero=ok base_propia=ok provisional_tramo_propio=ok cobertura_baja=marcada estado=verde");
