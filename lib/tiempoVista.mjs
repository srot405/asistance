// Vocabulario, constantes y reglas PURAS de la vista "Tiempo en clase" (TOC-140).
// Sin I/O: lo importan los tests bajo Node, el servidor y los componentes.
//
// Regla (Samuel, 2026-10-06): ROJO POR TIEMPO = menos del 50 % del tiempo de SU clase (relativo,
// inclusivo: exactamente 50 % cumple). Un tiempo no medido NUNCA es rojo ni 0. En produccion el
// frontend NO recalcula veredictos: lee el guardado por el backend (asist_tiempo_*). `cumple50()` y
// `cumple50Pct()` solo existen para datos DEMO y para los tests de borde.

export const UMBRAL_PORCENTAJE_ROJO = 50;
export const COBERTURA_MINIMA_COMPARABLE = 0.70;
export const MUESTRA_MINIMA = 5;
export const BINS_PCT = 10;

export const ESTADO_TIEMPO = Object.freeze({
  CUMPLE: "cumple", ROJO: "rojo_tiempo", SIN_DATO: "sin_dato_tiempo", PENDIENTE: "pendiente",
  AUSENTE: "ausente", SIN_CLASE: "sin_clase", NO_INGRESO: "no_ingreso", NO_CALCULADO: "no_calculado",
});

// Etiquetas e iconos: se definen UNA sola vez aqui (componentes y CSV las reusan).
export const ETIQUETAS = Object.freeze({
  cumple: "Cumple (50 % o más del tiempo de clase)",
  rojo_tiempo: "Rojo por tiempo (menos del 50 % del tiempo de clase)",
  no_ingreso: "No ingresó",
  sin_dato_tiempo: "Sin dato de tiempo",
});
export const ICONOS = Object.freeze({ cumple: "✓", rojo_tiempo: "⏱", no_ingreso: "✕", sin_dato_tiempo: "◌" });

export const TEXTO_NO_DISPONIBLE = "Tiempo aún no disponible. El resto del panel funciona con normalidad.";
export const TEXTO_SIN_DATO_AYUDA = "No se pudo medir cuánto estuvo (Zoom no registró bien su entrada o salida, o la clase no tiene un cierre confiable). " +
  "No cuenta como falta ni como rojo; se avisa para revisarlo.";
export const LEYENDA_VISITAS = "Un colado (entra a una clase que no es la suya) cuenta como ingreso y su tiempo se mide en esa sala. " +
  "El resultado de la semana es el de la MEJOR clase de cada persona; los tiempos no se suman. Un % bajo se conserva.";
export const TEXTO_ROJO_SEMANAL = "Estuvo menos del 50 % en la(s) clase(s) a la(s) que entró";

const esNumero = (v) => typeof v === "number" && Number.isFinite(v);

// Aritmetica ENTERA y inclusiva: nunca `pct >= 50` con decimales. null si no hay base.
export function cumple50(segundosPresente, segundosVentana) {
  if (!esNumero(segundosPresente) || !esNumero(segundosVentana) || segundosVentana <= 0 || segundosPresente < 0) return null;
  return segundosPresente * 100 >= UMBRAL_PORCENTAJE_ROJO * segundosVentana;
}
// Solo demo/tests con % ya truncado a 1 decimal.
export function cumple50Pct(pct) {
  return esNumero(pct) ? Math.round(pct * 10) >= UMBRAL_PORCENTAJE_ROJO * 10 : null;
}
// % truncado a 1 decimal, tope 100 (igual que el backend: trunc(1000*seg/ventana)/10).
export function pctTiempo(segundosPresente, segundosVentana) {
  if (!esNumero(segundosPresente) || !esNumero(segundosVentana) || segundosVentana <= 0 || segundosPresente < 0) return null;
  return Math.min(1000, Math.floor((1000 * segundosPresente) / segundosVentana)) / 10;
}

const CAMPOS = ["roster", "n_ingresaron", "n_medibles", "n_cumplen", "n_rojo", "n_sin_dato", "n_pendiente"];
// Suma de CONTEOS (pooled). Prohibido promediar porcentajes.
export function sumarConteos(filas) {
  const total = Object.fromEntries(CAMPOS.map((c) => [c, 0]));
  for (const fila of filas) for (const c of CAMPOS) total[c] += Number(fila?.[c] ?? 0) || 0;
  return total;
}

export function porcentajeCumple(c) {
  return c && c.n_medibles > 0 ? (c.n_cumplen / c.n_medibles) * 100 : null;
}
export function porcentajeRojo(c) {
  return c && c.n_medibles > 0 ? (c.n_rojo / c.n_medibles) * 100 : null;
}
// Fraccion 0..1 de ingresados con tiempo medido; null si nadie ingreso.
export function coberturaTiempo(c) {
  return c && c.n_ingresaron > 0 ? c.n_medibles / c.n_ingresaron : null;
}
export function textoCobertura(c) {
  const m = c?.n_ingresaron ?? 0;
  const n = c?.n_medibles ?? 0;
  return m === 0 ? "0 de 0 con tiempo medido · aún no hay ingresos" : `${n} de ${m} con tiempo medido`;
}
// % para pantalla con UN decimal y coma, TRUNCADO (49,96 se ve 49,9, nunca 50): lo que se ve no puede aparentar
// cumplir un umbral que el valor exacto no cumple. La comparacion con el umbral usa SIEMPRE el valor exacto (cumple50).
export function porcentajeUnDecimal(valor) {
  if (!esNumero(valor)) return "—";
  return `${(Math.floor(valor * 10 + 1e-9) / 10).toFixed(1).replace(".", ",")} %`;
}
export function porcentajeTexto(valor) {
  return valor == null ? "—" : `${valor.toFixed(1)} %`;
}

// "sin_dato" (nada medido o nadie ingreso) | "baja" (< 0.70) | "ok". Acepta fraccion o conteos.
export function nivelCobertura(cobertura) {
  const f = typeof cobertura === "object" && cobertura !== null ? coberturaTiempo(cobertura) : cobertura;
  if (f == null || !(f > 0)) return "sin_dato";
  return f < COBERTURA_MINIMA_COMPARABLE ? "baja" : "ok";
}

// Los conteos de una fila tienen que cuadrar (solo sesiones PROPIAS; las visitas van aparte).
export function cuadreTiempo(c) {
  const errores = [];
  const suma = c.n_cumplen + c.n_rojo + c.n_sin_dato + c.n_pendiente;
  if (c.n_ingresaron !== suma) errores.push(`n_ingresaron=${c.n_ingresaron} <> cumplen+rojo+sin_dato+pendiente=${suma}`);
  if (c.n_medibles !== c.n_cumplen + c.n_rojo) errores.push(`n_medibles=${c.n_medibles} <> cumplen+rojo=${c.n_cumplen + c.n_rojo}`);
  return { ok: errores.length === 0, errores };
}

// Estado de la vista a partir de la respuesta HTTP ya parseada y/o un error { status }.
export function estadoVistaTiempo(respuesta, error = null) {
  if (error) {
    if (error.status === 400) return "no_detalle";
    if (error.status === 503 || error.status === 500) return "no_disponible";
    return "error";
  }
  if (!respuesta) return "cargando";
  if (respuesta.disponible === false) return "no_disponible";
  if (respuesta.hay_tiempos === false) return "vacio";
  return "ok";
}

// SI/NO/"" para CSV (nunca "NO" por "no medido").
export function textoCumple50(valor) {
  return valor === true ? "SI" : valor === false ? "NO" : "";
}
