// CSV nominal (con nombre) — separado a propósito de lib/exportar.mjs, que solo
// construye el CSV agregado de /api/exportar. Este módulo lo usa exclusivamente
// app/api/exportar-nominal/route.ts, protegida siempre por exigirAcceso (real) o
// por datos sintéticos (demo) — nunca por ambas cosas a la vez.
import { line } from "./csvSeguro.mjs";
import { textoCumple50 } from "./tiempoVista.mjs";

export function construirCsvNominal(filas, alcance) {
  if (alcance !== "semana" && alcance !== "dia") throw new RangeError("Alcance de exportación no válido");
  const header = ["nombre", "ciudad", "franja", "fecha"];
  const cuerpo = filas.map((fila) => line([fila.nombre, fila.ciudad, fila.slot_id, fila.fecha ?? ""]));
  return {
    contenido: "\uFEFF" + [line(header), ...cuerpo].join("\r\n") + "\r\n",
    archivo: alcance === "dia" ? "no_ingresaron_dia" : "no_ingresaron_semana",
  };
}

// CSV de la pestaña Presencia (TOC-91): mismas 3 categorías del reporte en
// vivo (🟢 Presente · 🟠 Entró y salió · 🔴 Nunca entró). Reusa este mismo
// módulo (y la misma ruta /api/exportar-nominal, con vista=presencia) en vez
// de crear un CSV nominal aparte: es el mismo tipo de archivo (nombre + ciudad
// detrás de exigirAcceso), solo con una columna de estado en vez de "franja/fecha".
export function construirCsvPresencia(filas) {
  // TOC-140: al final, el tiempo de esa persona en esa clase (solo si hay medicion; nunca 0 por "no medido").
  const header = ["nombre", "ciudad", "estado", "minutos", "pct_tiempo", "estado_tiempo", "cumple_50"];
  const cuerpo = filas.map((fila) => {
    const medido = fila.estado_tiempo === "cumple" || fila.estado_tiempo === "rojo_tiempo";
    return line([fila.nombre, fila.ciudad, fila.estado, fila.minutos ?? "", medido ? (fila.pct_tiempo ?? "") : "",
      fila.estado_tiempo ?? "no_calculado", medido ? textoCumple50(fila.cumple_50) : ""]);
  });
  return { contenido: "\uFEFF" + [line(header), ...cuerpo].join("\r\n") + "\r\n", archivo: "presencia_clase" };
}

// CSV nominal de TIEMPO (TOC-140, plan unico B.7): una fila por persona-sesion; la visita lleva es_visita=SI y la
// franja donde se midio. pct_tiempo/minutos solo con cumple|rojo_tiempo (vacio en el resto: nunca 0 por "no medido").
// cumple_50 sale del veredicto guardado (true->SI, false->NO, null->vacio). definitivo: SI/NO/vacio.
export const HEADER_CSV_TIEMPO = ["nombre", "ciudad", "franja", "franja_tiempo", "es_visita", "fecha", "pct_tiempo", "estado_tiempo",
  "cumple_50", "minutos", "motivo_sin_dato", "definitivo"];
export function construirCsvTiempo(filas) {
  const ordenadas = [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  const cuerpo = ordenadas.map((f) => {
    const medido = f.estado_tiempo === "cumple" || f.estado_tiempo === "rojo_tiempo";
    return line([f.nombre, f.ciudad, f.franja ?? "", f.franja_tiempo ?? "", f.es_visita ? "SI" : "NO", f.fecha ?? "",
      medido ? (f.pct_tiempo ?? "") : "", f.estado_tiempo, medido ? textoCumple50(f.cumple_50) : "",
      medido ? (f.minutos ?? "") : "", f.motivo_sin_dato ?? "",
      f.estado_tiempo === "cumple" || f.definitivo === true ? "SI" : f.definitivo === false ? "NO" : ""]);
  });
  return { contenido: "\uFEFF" + [line(HEADER_CSV_TIEMPO), ...cuerpo].join("\r\n") + "\r\n", archivo: "tiempo" };
}
