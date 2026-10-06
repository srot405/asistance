import assert from "node:assert/strict";
import { construirHistograma, histogramaDesdeHist, indiceBin } from "../lib/histogramaTiempo.mjs";

const vacio = construirHistograma([]);
assert.equal(vacio.bins.length, 10, "10 bins estables incluso sin datos");
assert.equal(vacio.total, 0);
assert.equal(vacio.corte, 50);
assert.deepEqual(vacio.bins.map((b) => [b.desde, b.hasta]), Array.from({ length: 10 }, (_, i) => [i * 10, i * 10 + 10]));

assert.equal(indiceBin(49.9), 4, "49,9 va al bin 40-50");
assert.equal(indiceBin(50), 5, "50,0 va al bin 50-60");
assert.equal(indiceBin(100), 9, "100 va al ultimo");
assert.equal(indiceBin(0), 0);
assert.equal(indiceBin(99.9), 9);
const h = construirHistograma([49.9, 50, 100, null, undefined, Number.NaN, -3, 0, 12.3]);
assert.equal(h.total, 5, "ignora null/NaN/negativos");
assert.equal(h.bins[4].n, 1);
assert.equal(h.bins[5].n, 1);
assert.equal(h.bins[9].n, 1);
assert.equal(h.bins[0].n, 1);
assert.equal(h.bins[1].n, 1);
assert.equal(h.bins[4].lado, "rojo");
assert.equal(h.bins[5].lado, "cumple");
assert.equal(h.bins.reduce((a, b) => a + b.n, 0), h.total, "suma de bins = medidos");
assert.ok(h.bins.slice(0, 5).every((b) => b.lado === "rojo") && h.bins.slice(5).every((b) => b.lado === "cumple"), "ningun bin mezcla lados");
const s = histogramaDesdeHist([[1, 0, 0, 0, 0, 0, 0, 0, 0, 2], [0, 1, 0, 0, 0, 0, 0, 0, 0, 1], null, [1, 2]]);
assert.deepEqual(s.bins.map((b) => b.n), [1, 1, 0, 0, 0, 0, 0, 0, 0, 3], "suma elemento a elemento; ignora hist nulo o mal formado");
console.log("RESUMEN: histograma=10_bins corte=50 49_9=rojo 50=cumple 100=ultimo sin_mezcla=ok estado=verde");
