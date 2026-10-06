// CSV nominal (con nombre) — separado a propósito de lib/exportar.mjs, que solo
// construye el CSV agregado de /api/exportar. Este módulo lo usa exclusivamente
// app/api/exportar-nominal/route.ts, protegida siempre por exigirAcceso (real) o
// por datos sintéticos (demo) — nunca por ambas cosas a la vez.
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const line = (row) => row.map(csv).join(",");

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
  const header = ["nombre", "ciudad", "estado", "minutos"];
  const cuerpo = filas.map((fila) => line([fila.nombre, fila.ciudad, fila.estado, fila.minutos ?? ""]));
  return { contenido: "\uFEFF" + [line(header), ...cuerpo].join("\r\n") + "\r\n", archivo: "presencia_clase" };
}
