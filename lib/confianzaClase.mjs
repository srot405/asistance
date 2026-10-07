// Confianza del dato por CLASE y estado del cuadre automatico (TOC-151). Sin I/O, solo agregados (nada de PII).
// Entradas (las arma lib/servidor/leerConfianza.ts o el demo):
//  - sesiones: filas de asist_sesiones { sesion_id, slot_id, fecha, estado_captura }.
//  - cuadre:   filas de asist_cuadre_clase (084) { sesion_id, slot_id, n_panel, n_api, n_webhook, n_ok, n_diferencias, n_informativas, estado }.
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
  cuadrada: "Cuadrada", con_diferencias: "Con diferencias", sin_cuadre: "Sin cuadre",
});
export const AYUDA_CUADRE = Object.freeze({
  cuadrada: "El panel, la API de Zoom y el webhook coinciden para esta clase.",
  con_diferencias: "Hay personas que una fuente cuenta y otra no, sin explicación. Revisa el cuadre antes de usar la cifra.",
  sin_cuadre: "Todavía no se calculó el cuadre de esta clase.",
});

function juntarCuadre(filas) {
  if (!filas.length) return null;
  const alguna = (k) => filas.some((f) => f[k] == null);
  const suma = (k) => (alguna(k) ? null : filas.reduce((a, f) => a + n0(f[k]), 0));
  return {
    estado: filas.some((f) => f.estado === "con_diferencias") ? "con_diferencias" : "cuadrada",
    n_diferencias: filas.reduce((a, f) => a + n0(f.n_diferencias), 0), n_informativas: filas.reduce((a, f) => a + n0(f.n_informativas), 0),
    n_panel: suma("n_panel"), n_api: suma("n_api"), n_webhook: suma("n_webhook"),
  };
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
      cuadre: cuadreDisponible ? (c ?? { estado: "sin_cuadre", n_diferencias: 0, n_informativas: 0, n_panel: null, n_api: null, n_webhook: null }) : null };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));
  const cuenta = (f) => clases.filter(f).length;
  return {
    disponible: true, semana, cuadre_disponible: cuadreDisponible, clases,
    resumen: { clases: clases.length, capturadas: cuenta((c) => c.confianza === "capturada"),
      cuadradas: cuenta((c) => c.cuadre?.estado === "cuadrada"), con_diferencias: cuenta((c) => c.cuadre?.estado === "con_diferencias"),
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
