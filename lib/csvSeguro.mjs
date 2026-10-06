// Helper CSV compartido (reporte, nominal, agregado): escapa comillas Y neutraliza
// inyección de fórmulas (CWE-1236). Decide por TIPO: un number (negativos, %, minutos)
// jamás se toca; solo un string que, tras quitar espacios a la izquierda, empieza por
// = + - @ (o que empieza por TAB / CR) recibe un `'` delante para que Excel/Sheets lo
// traten como texto. Un "-" solo es inofensivo (no es fórmula) y se deja igual.
const DISPARADOR = /^[=+\-@]/;

export function neutralizarFormula(value) {
  if (typeof value !== "string") return value;
  if (value === "-") return value;
  if (/^[\t\r]/.test(value) || DISPARADOR.test(value.trimStart())) return `'${value}`;
  return value;
}

export const csv = (value) => `"${String(neutralizarFormula(value) ?? "").replaceAll('"', '""')}"`;
export const line = (row) => row.map(csv).join(",");
