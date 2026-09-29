// Cálculo puro para el gráfico de tendencia de la pestaña Historial (TOC-91,
// 2026-09-29): a partir de `resultados` (el mismo array que ya pintan las
// barras de texto de TendenciaHistorica), arma los puntos graficables y los
// agrupa en tramos contiguos. Un hueco de nivel "Sin dato" corta el trazo
// (tramo nuevo) en vez de interpolarse como una caída real a 0%. Sin I/O:
// vive en .mjs para que scripts/test-tendencia-grafico.mjs lo corra bajo Node
// sin type-stripping (mismo patrón que lib/detalleCalculo.mjs).

// Un punto por fila de `resultados`. `valor` es null cuando no hay % que
// graficar (nivel "Sin dato", o "Solo semanal"/"Detalle" con
// porcentaje_retencion null): esas semanas NUNCA se dibujan como 0%.
export function puntosTendencia(resultados) {
  return resultados.map((fila, indice) => ({
    indice,
    semana: fila.semana,
    materia: fila.materia,
    nivel: fila.nivel,
    valor: fila.porcentaje_retencion,
    graficable: fila.nivel !== "Sin dato" && fila.porcentaje_retencion != null,
    // "mínimo": la semana tuvo clases sin captura, el % real es igual o mayor
    // al mostrado (mismo criterio que esMinimo() en TendenciaHistorica.tsx).
    esMinimo: fila.nivel !== "Sin dato" && !fila.captura_completa,
  }));
}

// Agrupa los puntos graficables en tramos contiguos por índice, para dibujar
// un trazo por tramo: el hueco entre tramos queda visualmente CORTADO, nunca
// interpolado.
export function tramosTendencia(puntos) {
  const tramos = [];
  let actual = [];
  for (const punto of puntos) {
    if (!punto.graficable) {
      if (actual.length) tramos.push(actual);
      actual = [];
      continue;
    }
    actual.push(punto);
  }
  if (actual.length) tramos.push(actual);
  return tramos;
}
