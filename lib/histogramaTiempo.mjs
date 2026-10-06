// Histograma del % del tiempo de clase (solo medidos). 10 bins de 10 puntos; el corte de 50 cae en la
// frontera entre el bin 40-50 (rojo) y el 50-60 (cumple), asi que ningun bin mezcla lados.
import { BINS_PCT, UMBRAL_PORCENTAJE_ROJO } from "./tiempoVista.mjs";

const N_BINS = 10;

export function indiceBin(pct) {
  // decimas enteras evitan errores de coma flotante (49.9 -> 499, 50 -> 500)
  const decimas = Math.round(pct * 10);
  return Math.min(N_BINS - 1, Math.max(0, Math.floor(decimas / (BINS_PCT * 10))));
}

function armar(conteos) {
  const bins = conteos.map((n, i) => ({
    desde: i * BINS_PCT, hasta: (i + 1) * BINS_PCT, n,
    lado: (i + 1) * BINS_PCT <= UMBRAL_PORCENTAJE_ROJO ? "rojo" : "cumple",
  }));
  return { bins, total: conteos.reduce((a, b) => a + b, 0), corte: UMBRAL_PORCENTAJE_ROJO };
}

// pctMedidos: % de los medibles (cumple + rojo). Ignora null/NaN. Devuelve SIEMPRE los 10 bins.
export function construirHistograma(pctMedidos) {
  const conteos = new Array(N_BINS).fill(0);
  for (const p of pctMedidos) {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0) continue;
    conteos[indiceBin(p)] += 1;
  }
  return armar(conteos);
}

// Si el backend ya entrego `hist` (10 enteros) se usa tal cual; varios `hist` se suman elemento a elemento.
export function histogramaDesdeHist(hists) {
  const conteos = new Array(N_BINS).fill(0);
  for (const h of hists) {
    if (!Array.isArray(h) || h.length !== N_BINS) continue;
    h.forEach((n, i) => { conteos[i] += Number(n) || 0; });
  }
  return armar(conteos);
}
