// Leyenda GLOBAL de los codigos de celda/CSV del panel (TOC-146). Una sola lista: la usa el encabezado.
// Mismos significados que LEYENDA de lib/reporteSemana.mjs (CSV del reporte); cambiar uno exige cambiar el otro.
export const CODIGOS_CELDA = Object.freeze([
  { codigo: "SI", texto: "Ingresó a su clase." },
  { codigo: "NO", texto: "No ingresó (la captura de esa clase está completa)." },
  { codigo: "NO?", texto: "Sin ingreso, por revisar: la semana sigue en revisión y puede cambiar." },
  { codigo: "ZL", texto: "Zoom limit: la sala no se pudo capturar. Es un dato que falta, NO una ausencia." },
  { codigo: "P", texto: "Pendiente: la clase aún no ocurre." },
  { codigo: "SC", texto: "Día declarado sin clase: sale del denominador y no cuenta como ausencia." },
]);
