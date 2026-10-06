// Tendencia semana a semana del % que cumple el 50 % del tiempo de clase (TOC-140). Pura, sin I/O.
// Cada semana se divide por SU PROPIA base (n_medibles de n_ingresaron); una semana sin tiempos es un
// HUECO ("sin dato de tiempo"), nunca 0 %; la semana abierta es PROVISIONAL y va en tramo propio.
import { nivelCobertura } from "./tiempoVista.mjs";

// resultados: filas de asist_semana_resumen (las del Historial). serie: salida de armarSerieTiempo.
// Se muestran las semanas de nivel Detalle (las unicas con tiempo por clase) y cualquiera con fila de tiempo.
export function puntosTendenciaTiempo(resultados, serie) {
  const porSemana = new Map((serie ?? []).map((s) => [s.semana, s]));
  const filas = resultados.filter((r) => r.nivel === "Detalle" || porSemana.has(r.semana));
  return filas.map((r, indice) => {
    const s = porSemana.get(r.semana);
    const medibles = s?.n_medibles ?? 0;
    const ingresaron = s?.n_ingresaron ?? 0;
    const graficable = medibles > 0;
    return {
      indice, semana: r.semana, materia: r.materia, tieneFila: Boolean(s), graficable,
      valor: graficable ? (s.n_cumplen / medibles) * 100 : null,
      n_medibles: medibles, n_ingresaron: ingresaron, n_cumplen: s?.n_cumplen ?? 0, n_rojo: s?.n_rojo ?? 0, n_sin_dato: s?.n_sin_dato ?? 0,
      cobertura: ingresaron > 0 ? medibles / ingresaron : null,
      nivelCobertura: nivelCobertura(ingresaron > 0 ? medibles / ingresaron : null),
      // semana sin fila de tiempo: no se sabe si esta abierta; se toma de la fila de resumen
      provisional: s ? s.provisional : false,
      sinTiempos: !graficable,
    };
  });
}

export function tramosTendenciaTiempo(puntos) {
  const tramos = [];
  let actual = [];
  const cerrar = () => { if (actual.length) tramos.push(actual); actual = []; };
  for (const p of puntos) {
    if (!p.graficable) { cerrar(); continue; }
    if (p.provisional) { cerrar(); tramos.push([p]); continue; }
    actual.push(p);
  }
  cerrar();
  return tramos;
}
