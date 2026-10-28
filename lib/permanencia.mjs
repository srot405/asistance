// TOC-152. Presentación; no cambia el veredicto técnico cumple_50 ni toma acciones.
export function colorPermanencia(pct) {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100) return "sin_dato";
  return pct < 60 ? "rojo" : pct < 80 ? "amarillo" : "verde";
}

// Una entrada identificada es evidencia suficiente, incluso sin tiempo o con 0 % truncado.
// null significa captura insuficiente: jamás inventar un No.
export function textoIngreso(entro) {
  return entro === true ? "Sí" : entro === false ? "No" : "Sin dato";
}

export function ingresoClase(tieneEntrada, tieneTiempo, capturaCompleta) {
  return tieneEntrada || tieneTiempo ? true : capturaCompleta ? false : null;
}

export function resumirPermanencia(filas) {
  const ingreso = { si: 0, no: 0, sin_dato: 0 };
  const permanencia = { rojo: 0, amarillo: 0, verde: 0, sin_dato: 0 };
  for (const f of filas) {
    ingreso[f.ingreso === true ? "si" : f.ingreso === false ? "no" : "sin_dato"]++;
    // La permanencia solo corresponde a entradas comprobadas.
    if (f.ingreso === true) permanencia[colorPermanencia(f.pct)]++;
  }
  return { ingreso, permanencia };
}
