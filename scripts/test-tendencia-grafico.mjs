import assert from "node:assert/strict";
import { HISTORICO_DEMO } from "../lib/historico-demo.mjs";
import { puntosTendencia, tramosTendencia } from "../lib/tendenciaGrafico.mjs";

// Caso real: el fixture demo actual (6 semanas, todas con dato) da un solo tramo.
const puntosDemo = puntosTendencia(HISTORICO_DEMO.resultados);
assert.equal(puntosDemo.length, HISTORICO_DEMO.resultados.length, "un punto por fila");
assert.ok(puntosDemo.every((p) => p.graficable), "el fixture demo actual no tiene semanas Sin dato");
assert.equal(tramosTendencia(puntosDemo).length, 1, "todas las semanas seguidas = un solo tramo");

// Caso sintético con huecos: Sin dato NUNCA se dibuja como 0%, y corta el tramo.
const filasSinteticas = [
  { semana: "S1", materia: "M", nivel: "Detalle", porcentaje_retencion: 80, captura_completa: true },
  { semana: "S2", materia: "M", nivel: "Sin dato", porcentaje_retencion: null, captura_completa: false },
  { semana: "S3", materia: "M", nivel: "Solo semanal", porcentaje_retencion: 40, captura_completa: false },
  { semana: "S4", materia: "M", nivel: "Solo semanal", porcentaje_retencion: 55, captura_completa: true },
];
const puntos = puntosTendencia(filasSinteticas);
assert.equal(puntos[1].graficable, false, "Sin dato no es graficable");
assert.equal(puntos[1].valor, null, "Sin dato nunca tiene valor 0 ni ningún número");
assert.equal(puntos[2].esMinimo, true, "Solo semanal con captura incompleta es mínimo");
assert.equal(puntos[3].esMinimo, false, "captura_completa=true no es mínimo aunque sea Solo semanal");

const tramos = tramosTendencia(puntos);
assert.equal(tramos.length, 2, "el hueco de Sin dato corta el trazo en 2 tramos");
assert.deepEqual(tramos[0].map((p) => p.semana), ["S1"]);
assert.deepEqual(tramos[1].map((p) => p.semana), ["S3", "S4"]);

// Ningún punto graficable debe terminar con valor 0 solo por venir de una fila "Sin dato".
for (const punto of puntos) if (!punto.graficable) assert.notEqual(punto.valor, 0);

console.log("RESUMEN: tests=tendencia-grafico casos=8 estado=verde");
