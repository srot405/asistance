import { line } from "./csvSeguro.mjs";

export function construirCsv(data, vista) {
  if (vista !== "Resumen") throw new RangeError("Vista de exportación no válida");
  const header = ["semana", "materia", "nivel", "poblacion", "asistieron", "nunca",
    "porcentaje_retencion", "porcentaje_nunca", "clases_capturadas", "clases_programadas",
    "porcentaje_cobertura", "captura_completa", "aviso"];
  const row = [data.semana, data.materia, data.nivel, data.poblacion, data.asistieron,
    data.nunca, data.porcentaje_retencion, data.porcentaje_nunca, data.clases_capturadas,
    data.clases_programadas, data.porcentaje_cobertura,
    data.captura_completa === false ? "captura incompleta" : "captura completa", data.aviso ?? ""];
  return { contenido: "\uFEFF" + [line(header), line(row)].join("\r\n") + "\r\n", archivo: "resumen" };
}
