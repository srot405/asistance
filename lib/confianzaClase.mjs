// Confianza del dato por CLASE y estado del cuadre automatico (TOC-151). Sin I/O, solo agregados (nada de PII).
// Entradas (las arma lib/servidor/leerConfianza.ts o el demo):
//  - sesiones: filas de asist_sesiones { sesion_id, slot_id, fecha, estado_captura }.
//  - cuadre:   filas de asist_cuadre_clase (084) { sesion_id, slot_id, n_panel, n_api, n_webhook, n_ok, n_diferencias, n_informativas, estado }
//              + (090, opcionales) { nivel, origen, motivo }. Sin nivel la fila se lee como 084 (completo/automatico).
//              null = la tabla aun no existe en esa base (degradado: la pantalla no muestra estado de cuadre, el resto sigue igual).
// El estado de captura NO se recalcula: se traduce el que guardo el backend a las 4 etiquetas del plan
// (sin captura / zoom_limit / dudosa / capturada) mas los estados "aun no hay dato" (por ocurrir, en curso, sin clase).
const n0 = (v) => Number(v ?? 0) || 0;

export const CONFIANZA = Object.freeze({
  CAPTURADA: "capturada", ZOOM_LIMIT: "zoom_limit", DUDOSA: "dudosa", SIN_CAPTURA: "sin_captura",
  POR_OCURRIR: "por_ocurrir", EN_CURSO: "en_curso", SIN_CLASE: "sin_clase",
});

// Icono + texto + ayuda: el color nunca es la unica pista.
export const CHIPS_CONFIANZA = Object.freeze({
  capturada: { icono: "✓", texto: "Capturada", ayuda: "Zoom registró las entradas de esta clase." },
  zoom_limit: { icono: "ZL", texto: "Zoom limit", ayuda: "La sala no se pudo capturar por el límite de Zoom: es un dato que falta, NO una ausencia." },
  dudosa: { icono: "?", texto: "Dudosa", ayuda: "La captura existe pero el roster o las entradas no son confiables: léela con cuidado." },
  sin_captura: { icono: "✕", texto: "Sin captura", ayuda: "La clase ya pasó y no hay entradas registradas." },
  por_ocurrir: { icono: "P", texto: "Por ocurrir", ayuda: "La clase aún no ocurre." },
  en_curso: { icono: "…", texto: "En curso", ayuda: "La clase está ocurriendo: la cifra todavía cambia." },
  sin_clase: { icono: "SC", texto: "Sin clase", ayuda: "Día declarado sin clase: no cuenta como falla de captura." },
});
// recuperada_csv / recuperada_api (074): el dato se repuso despues; para el lector es una clase capturada.
const TRADUCCION = { capturada: "capturada", recuperada_csv: "capturada", recuperada_api: "capturada", zoom_limit_pendiente: "zoom_limit",
  dudosa: "dudosa", sin_captura: "sin_captura", por_ocurrir: "por_ocurrir", en_curso: "en_curso", sin_clase: "sin_clase" };
// De menos a mas confiable: si una franja tiene varias sesiones, manda la peor.
const PRIORIDAD = ["sin_captura", "zoom_limit", "dudosa", "en_curso", "por_ocurrir", "sin_clase", "capturada"];

// Estado desconocido (una migracion futura): se trata como dudoso, nunca como capturado.
export function confianzaDeCaptura(estadoCaptura) {
  return TRADUCCION[estadoCaptura] ?? CONFIANZA.DUDOSA;
}

export const TEXTO_CUADRE = Object.freeze({
  cuadrada: "Cuadrada", cuadrada_interna: "Cuadrada (interna)", parcial: "Parcial", con_diferencias: "Con diferencias", sin_cuadre: "Sin cuadre",
});
export const AYUDA_CUADRE = Object.freeze({
  cuadrada: "El panel, la API de Zoom y el webhook coinciden para esta clase.",
  cuadrada_interna: "Semana anterior al cuadre automático: el panel se verificó contra los tiempos de Zoom y ASISTENCIA-VALIDADA (sin webhook en vivo).",
  parcial: "El cuadre se hizo con menos de tres fuentes; se recalcula solo cuando llegue la que falta.",
  con_diferencias: "Hay personas que una fuente cuenta y otra no, sin explicación. Revisa el cuadre antes de usar la cifra.",
  sin_cuadre: "Todavía no se calculó el cuadre de esta clase.",
});
// Motivo (090) de un cuadre parcial, en palabras del lector. Un motivo desconocido no se muestra.
export const MOTIVO_PARCIAL = Object.freeze({
  api_no_cargada: "falta la API de Zoom", webhook_sin_eventos: "el webhook no registró eventos", panel_vacio: "el panel no tiene entradas",
  fuentes_insuficientes: "faltan fuentes", sin_captura_panel_vacio: "clase sin captura y panel vacío",
  "sin fuentes de contraste (ni tiempos ni hoja durable)": "sin tiempos ni hoja para contrastar",
});

// Estado visible de UNA franja a partir de sus filas (090: estado + nivel). Orden: diferencias > parcial > no_aplica > interna > cuadrada.
//  - parcial: estado parcial/pendiente o nivel parcial (menos de 3 fuentes).
//  - no_aplica: TODAS sus filas son nivel no_aplica (sin clase, ZL pendiente, sin captura sin fuentes): sin chip, tampoco «Sin cuadre».
//  - cuadrada_interna: alguna fila nivel interno (cuadre retroactivo, sin webhook en vivo).
const esParcial = (f) => f.estado === "parcial" || f.estado === "pendiente" || f.nivel === "parcial";
function estadoJuntado(filas) {
  if (filas.some((f) => f.estado === "con_diferencias")) return "con_diferencias";
  if (filas.some(esParcial)) return "parcial";
  if (filas.every((f) => f.nivel === "no_aplica")) return "no_aplica";
  if (filas.some((f) => f.nivel === "interno")) return "cuadrada_interna";
  return "cuadrada";
}

function juntarCuadre(filas) {
  if (!filas.length) return null;
  const alguna = (k) => filas.some((f) => f[k] == null);
  const suma = (k) => (alguna(k) ? null : filas.reduce((a, f) => a + n0(f[k]), 0));
  const estado = estadoJuntado(filas);
  const motivo = estado === "parcial" ? (filas.find((f) => esParcial(f) && f.motivo)?.motivo ?? null) : null;
  return {
    estado, motivo,
    n_diferencias: filas.reduce((a, f) => a + n0(f.n_diferencias), 0), n_informativas: filas.reduce((a, f) => a + n0(f.n_informativas), 0),
    n_panel: suma("n_panel"), n_api: suma("n_api"), n_webhook: suma("n_webhook"),
  };
}

// Que cuadre se MUESTRA junto al chip de captura (null = ningun chip de cuadre):
//  - «Sin cuadre» solo tiene sentido en una clase que ya deberia tener cuadre (capturada, dudosa, sin captura). En por_ocurrir, en_curso,
//    sin_clase y zoom_limit no hay nada que cuadrar todavia: no se pinta.
//  - «Cuadrada» solo junto a una captura confiable: un ✓ Cuadrada al lado de ZL o Dudosa se leeria como que el dato es bueno.
//  - «Con diferencias» se muestra SIEMPRE: es una alerta, y ocultarla seria peor que repetirla.
//  - «Parcial» (TOC-156 D5.5) se muestra donde se esperaria cuadre: avisa que se verifico con menos fuentes, no que la cifra este mal.
//  - no_aplica (090): la clase no se puede/debe cuadrar; no se pinta nada.
const CON_CUADRE_ESPERADO = new Set(["capturada", "dudosa", "sin_captura"]);
function cuadreVisible(confianza, juntado) {
  if (juntado) {
    if (juntado.estado === "no_aplica") return null;
    if (juntado.estado === "con_diferencias") return juntado;
    if (juntado.estado === "parcial") return CON_CUADRE_ESPERADO.has(confianza) ? juntado : null;
    return confianza === "capturada" ? juntado : null;
  }
  return CON_CUADRE_ESPERADO.has(confianza)
    ? { estado: "sin_cuadre", motivo: null, n_diferencias: 0, n_informativas: 0, n_panel: null, n_api: null, n_webhook: null } : null;
}

export function armarConfianza({ semana, sesiones, cuadre }) {
  const cuadreDisponible = Array.isArray(cuadre);
  const cuadrePorSlot = new Map();
  for (const f of cuadre ?? []) cuadrePorSlot.set(f.slot_id, [...(cuadrePorSlot.get(f.slot_id) ?? []), f]);
  const porSlot = new Map();
  for (const s of sesiones) porSlot.set(s.slot_id, [...(porSlot.get(s.slot_id) ?? []), s]);
  const clases = [...porSlot.entries()].map(([slot_id, lista]) => {
    const confianzas = lista.map((s) => confianzaDeCaptura(s.estado_captura));
    const confianza = PRIORIDAD.find((c) => confianzas.includes(c));
    const c = juntarCuadre(cuadrePorSlot.get(slot_id) ?? []);
    return { slot_id, fecha: lista[0].fecha, confianza, estado_captura: lista.find((s) => confianzaDeCaptura(s.estado_captura) === confianza).estado_captura,
      cuadre: cuadreDisponible ? cuadreVisible(confianza, c) : null };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));
  const cuenta = (f) => clases.filter(f).length;
  return {
    disponible: true, semana, cuadre_disponible: cuadreDisponible, clases,
    resumen: { clases: clases.length, capturadas: cuenta((c) => c.confianza === "capturada"),
      cuadradas: cuenta((c) => c.cuadre?.estado === "cuadrada" || c.cuadre?.estado === "cuadrada_interna"),
      con_diferencias: cuenta((c) => c.cuadre?.estado === "con_diferencias"),
      parciales: cuenta((c) => c.cuadre?.estado === "parcial"),
      sin_cuadre: cuenta((c) => c.cuadre?.estado === "sin_cuadre") },
  };
}

// Demo: filas de asist_cuadre_clase SINTETICAS a partir de las sesiones del fixture. Las capturadas cuadran, salvo la segunda
// de cada semana (con diferencias) y la tercera (sin fila: "sin cuadre"), para que las tres variantes se vean con datos.
export function cuadreSinteticoDemo(sesiones) {
  const capturadas = sesiones.filter((s) => s.estado_captura === "capturada");
  return capturadas.filter((_, i) => i !== 2).map((s, i) => {
    const dif = i === 1;
    return { sesion_id: s.sesion_id, slot_id: s.slot_id, n_panel: n0(s.entradas_totales), n_api: n0(s.entradas_totales) + (dif ? 2 : 0),
      n_webhook: n0(s.entradas_totales), n_ok: n0(s.entradas_totales), n_diferencias: dif ? 2 : 0, n_informativas: dif ? 0 : 1,
      estado: dif ? "con_diferencias" : "ok" };
  });
}
