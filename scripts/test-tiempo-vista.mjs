import assert from "node:assert/strict";
import {
  BINS_PCT, COBERTURA_MINIMA_COMPARABLE, ESTADO_TIEMPO, ETIQUETAS, MUESTRA_MINIMA, UMBRAL_PORCENTAJE_ROJO, coberturaTiempo, cuadreTiempo,
  cumple50, cumple50Pct, estadoVistaTiempo, nivelCobertura, pctTiempo, porcentajeCumple, sumarConteos, textoCobertura, textoCumple50,
} from "../lib/tiempoVista.mjs";

assert.equal(UMBRAL_PORCENTAJE_ROJO, 50);
assert.equal(MUESTRA_MINIMA, 5);
assert.equal(COBERTURA_MINIMA_COMPARABLE, 0.7);
assert.equal(BINS_PCT, 10);

// Frontera (aritmetica entera, inclusiva): 49,99 % rojo, exactamente 50 % cumple.
assert.equal(cumple50(3599, 7200), false);
assert.equal(cumple50(3600, 7200), true);
assert.equal(cumple50(3149, 6300), false);
assert.equal(cumple50(3150, 6300), true);
assert.equal(cumple50(2999, 6000), false);
assert.equal(cumple50(3000, 6000), true);
assert.equal(cumple50(2699, 5400), false);
assert.equal(cumple50(2700, 5400), true);
assert.equal(cumple50(0, 7200), false, "0 segundos medidos SI es rojo (distinto de no medido)");
// Sin dato: nunca false ni 0.
assert.equal(cumple50(null, 7200), null);
assert.equal(cumple50(undefined, 7200), null);
assert.equal(cumple50(100, 0), null);
assert.equal(cumple50(100, null), null);
assert.equal(cumple50(Number.NaN, 7200), null);
// % truncado a 1 decimal (igual que el backend) y coherente con el veredicto.
assert.equal(pctTiempo(3599, 7200), 49.9);
assert.equal(pctTiempo(3600, 7200), 50);
assert.equal(pctTiempo(9999, 7200), 100, "tope 100");
assert.equal(pctTiempo(null, 7200), null);
assert.equal(cumple50Pct(49.9), false);
assert.equal(cumple50Pct(50), true);
assert.equal(cumple50Pct(null), null);
for (const [seg, ventana] of [[3599, 7200], [3600, 7200], [3149, 6300], [3150, 6300], [1, 7200], [7200, 7200]])
  assert.equal(cumple50Pct(pctTiempo(seg, ventana)), cumple50(seg, ventana), `pct y entero coinciden en ${seg}/${ventana}`);

// Porcentajes: 0 medibles => null (no 0).
assert.equal(porcentajeCumple({ n_medibles: 0, n_cumplen: 0 }), null);
assert.equal(porcentajeCumple({ n_medibles: 4, n_cumplen: 3 }), 75);
assert.equal(coberturaTiempo({ n_ingresaron: 0, n_medibles: 0 }), null);
assert.equal(textoCobertura({ n_ingresaron: 560, n_medibles: 480 }), "480 de 560 con tiempo medido");
assert.equal(textoCobertura({ n_ingresaron: 0, n_medibles: 0 }), "0 de 0 con tiempo medido · aún no hay ingresos");

// Cobertura: 0 -> sin_dato, 0.69 -> baja, 0.70 -> ok.
assert.equal(nivelCobertura(0), "sin_dato");
assert.equal(nivelCobertura(null), "sin_dato");
assert.equal(nivelCobertura(0.69), "baja");
assert.equal(nivelCobertura(0.7), "ok");
assert.equal(nivelCobertura(1), "ok");
assert.equal(nivelCobertura({ n_ingresaron: 100, n_medibles: 69 }), "baja");
assert.equal(nivelCobertura({ n_ingresaron: 0, n_medibles: 0 }), "sin_dato");

// Cuadre.
assert.ok(cuadreTiempo({ n_ingresaron: 10, n_medibles: 7, n_cumplen: 5, n_rojo: 2, n_sin_dato: 2, n_pendiente: 1 }).ok);
const mal = cuadreTiempo({ n_ingresaron: 11, n_medibles: 7, n_cumplen: 5, n_rojo: 2, n_sin_dato: 2, n_pendiente: 1 });
assert.equal(mal.ok, false);
assert.match(mal.errores[0], /n_ingresaron=11/);
assert.equal(cuadreTiempo({ n_ingresaron: 10, n_medibles: 8, n_cumplen: 5, n_rojo: 2, n_sin_dato: 2, n_pendiente: 1 }).ok, false);

// sumarConteos suma conteos, NO promedia porcentajes (10/20 y 30/30 -> 40/50, no la media de 50 % y 100 %).
const suma = sumarConteos([{ n_ingresaron: 20, n_medibles: 20, n_cumplen: 10, n_rojo: 10 }, { n_ingresaron: 30, n_medibles: 30, n_cumplen: 30, n_rojo: 0 }]);
assert.equal(suma.n_cumplen, 40);
assert.equal(suma.n_medibles, 50);
assert.equal(porcentajeCumple(suma), 80, "pooled 80 %, no (50+100)/2 = 75 %");

// Mapeo de estado de la vista.
assert.equal(estadoVistaTiempo(null), "cargando");
assert.equal(estadoVistaTiempo({ disponible: false }), "no_disponible");
assert.equal(estadoVistaTiempo({ disponible: true, hay_tiempos: false }), "vacio");
assert.equal(estadoVistaTiempo({ disponible: true, hay_tiempos: true }), "ok");
assert.equal(estadoVistaTiempo(null, { status: 503 }), "no_disponible");
assert.equal(estadoVistaTiempo(null, { status: 400 }), "no_detalle");
assert.equal(estadoVistaTiempo(null, { status: 401 }), "error");

assert.equal(textoCumple50(true), "SI");
assert.equal(textoCumple50(false), "NO");
assert.equal(textoCumple50(null), "");
assert.equal(ESTADO_TIEMPO.ROJO, "rojo_tiempo");
assert.match(ETIQUETAS.rojo_tiempo, /menos del 50 %/);
assert.match(ETIQUETAS.cumple, /50 % o más/);
console.log("RESUMEN: tiempo_vista=ok umbral=50 frontera_49_99_y_50=ok sin_dato_nunca_rojo=ok cobertura_70=ok pooled=ok estado=verde");
