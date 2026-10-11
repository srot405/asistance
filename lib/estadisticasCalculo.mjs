// Calculo PURO de la pestana «Estadisticas» (TOC-150, V4). Sin I/O, sin PII: solo conteos de v_asist_corte (085, una fila por
// ciudad x clase) y v_asist_corte_nivel (087, totales ya agregados por semana / dia / ciudad / ciudad_dia).
//
// REGLAS (anti-reidentificacion y cuadre):
//  - La supresion n<5 la hace la VISTA: una fila `suprimido` trae TODAS las cifras en null. Aqui jamas se convierte en 0 ni se
//    deja vacia: se muestra «<5» (TEXTO_SUPRIMIDO).
//  - Los totales salen del nivel que corresponde a los filtros ('semana', 'dia', 'ciudad', 'ciudad_dia'). NUNCA se suman filas de
//    ciudad_dia ni de clase para "inventar" un total que la vista no publico (restar o sumar celdas suprimidas deja reconstruirlas).
//    Unico caso de suma: filtros de clase (cuenta Zoom / tipo) que ningun nivel resuelve; solo si NINGUNA clase del corte esta
//    suprimida (si no, el total no se publica).
//  - «No medibles» (en pantalla: «Sin captura confiable») va siempre aparte: nunca se suma a «no aparecieron». Se decide por el
//    estado_captura de la SESION (clase entera), no celda por celda como el «no medible» del calendario (SI/NO/P).
//  - «Suprimidos (<5)» (fase 1.5, plan de veracidad 2026-10-09): roster del nivel publicado − suma del roster de las filas de clase
//    VISIBLES del mismo corte. Hace que roster = visible + suprimidos. No revela nada nuevo: el total del nivel y las filas visibles
//    ya se publican, la resta ya era calculable; se muestra como UN agregado de todas las filas ocultas, nunca fila por fila.
import { mismaCiudad, normalizarCiudad } from "./rolesCalculo.mjs";
import { line } from "./csvSeguro.mjs";
import { confianzaDeCaptura } from "./confianzaClase.mjs";

const BOM = "﻿";
export const TEXTO_SUPRIMIDO = "<5";
export const SIN_DATO = "—";
export const ORDEN_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
// Semaforo VISUAL del % que entro a su clase (de los medibles). Es una ayuda de lectura, no una politica de la fundacion.
export const SEMAFORO = Object.freeze({ verde: 80, amarillo: 60 });

export const CIFRAS = Object.freeze(["roster", "entraron_a_su_clase", "fueron_a_otra", "no_aparecieron", "no_medibles", "visitas_recibidas"]);
export const FILTROS_VACIOS = Object.freeze({ ciudad: "", dia: "", cuenta: "", tipo: "" });

export const normalizarDia = (d) => String(d ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const posDia = (d) => { const i = ORDEN_DIAS.indexOf(normalizarDia(d)); return i < 0 ? 99 : i; };
const mismoDia = (a, b) => normalizarDia(a) === normalizarDia(b);
const esNumero = (v) => typeof v === "number" && Number.isFinite(v);
const unicos = (lista) => [...new Set(lista.filter((v) => v != null && v !== ""))];
const porNombre = (a, b) => normalizarCiudad(a).localeCompare(normalizarCiudad(b));

export function filtrosActivos(f) { return Boolean(f.ciudad || f.dia || f.cuenta || f.tipo); }
export const hayFiltroDeClase = (f) => Boolean(f.cuenta || f.tipo);

// Opciones de cada selector, tomadas de los datos de la semana (nunca de una lista fija).
export function opcionesFiltros(datos) {
  const niveles = datos?.niveles ?? []; const clases = datos?.clases ?? [];
  return {
    ciudades: unicos([...niveles.filter((n) => n.nivel === "ciudad").map((n) => n.ciudad), ...clases.map((c) => c.ciudad)]).sort(porNombre),
    dias: unicos([...niveles.filter((n) => n.nivel === "dia").map((n) => n.dia), ...clases.map((c) => c.dia)])
      .sort((a, b) => posDia(a) - posDia(b)),
    cuentas: unicos(clases.map((c) => c.cuenta_zoom)).sort(),
    tipos: unicos(clases.map((c) => c.tipo)).sort(),
  };
}

export function filtrarClases(clases, f) {
  return clases.filter((c) => (!f.ciudad || mismaCiudad(c.ciudad, f.ciudad)) && (!f.dia || mismoDia(c.dia, f.dia))
    && (!f.cuenta || c.cuenta_zoom === f.cuenta) && (!f.tipo || c.tipo === f.tipo));
}

// Nivel de v_asist_corte_nivel que responde a los filtros de ciudad/dia (los de clase no cambian el nivel).
export function nivelParaFiltros(f) {
  if (f.ciudad && f.dia) return "ciudad_dia";
  if (f.ciudad) return "ciudad";
  if (f.dia) return "dia";
  return "semana";
}

const buscarNivel = (niveles, nivel, ciudad, dia) => niveles.find((n) => n.nivel === nivel
  && (nivel === "semana" || nivel === "dia" || mismaCiudad(n.ciudad, ciudad))
  && (nivel === "semana" || nivel === "ciudad" || mismoDia(n.dia, dia)));

const cifrasDe = (fila) => Object.fromEntries(CIFRAS.map((k) => [k, fila[k] ?? null]));

// % que entro a su clase sobre los MEDIBLES (roster - no medibles). null si hay supresion o no hay medibles.
export function pctEntro(c) {
  if (!c || !esNumero(c.roster) || !esNumero(c.entraron_a_su_clase)) return null;
  const medibles = c.roster - (c.no_medibles ?? 0);
  return medibles > 0 ? Math.round((c.entraron_a_su_clase * 1000) / medibles) / 10 : null;
}
export function semaforo(pct) {
  if (pct == null) return "sin_dato";
  return pct >= SEMAFORO.verde ? "verde" : pct >= SEMAFORO.amarillo ? "amarillo" : "rojo";
}

// Bloque 1: las cifras del corte. fuente: 'nivel' (publicada por la vista) | 'clases' (suma exacta, ninguna suprimida) | 'ninguna'.
export function cifrasDelCorte(datos, f) {
  const niveles = datos?.niveles ?? [];
  if (!hayFiltroDeClase(f)) {
    const nivel = nivelParaFiltros(f);
    const fila = buscarNivel(niveles, nivel, f.ciudad, f.dia);
    if (!fila) return { fuente: "ninguna", nivel, suprimido: false, cifras: null, motivo: "sin_filas" };
    return { fuente: "nivel", nivel, suprimido: Boolean(fila.suprimido), cifras: fila.suprimido ? null : cifrasDe(fila), motivo: fila.suprimido ? "suprimido" : null };
  }
  const filas = filtrarClases(datos?.clases ?? [], f);
  if (filas.length === 0) return { fuente: "ninguna", nivel: "clases", suprimido: false, cifras: null, motivo: "sin_filas" };
  if (filas.some((c) => c.suprimido)) return { fuente: "clases", nivel: "clases", suprimido: true, cifras: null, motivo: "clase_suprimida", clases: filas.length };
  const cifras = Object.fromEntries(CIFRAS.map((k) => [k, filas.reduce((a, c) => a + (c[k] ?? 0), 0)]));
  return { fuente: "clases", nivel: "clases", suprimido: false, cifras, motivo: null, clases: filas.length };
}

// Cuadre del roster del corte contra la tabla «Clase x ciudad»: roster (nivel publicado) = visible (filas no suprimidas) + suprimidos.
// Solo con filtros de ciudad/dia (hay nivel publicado). Con filtros de clase no hay total publicado si alguna fila esta suprimida.
// coherente=false si la resta no es posible con filas de menos de 5 (cada fila oculta aporta entre 1 y 4): avisa de un descuadre
// de datos en vez de esconderlo.
export function suprimidosDelCorte(datos, f) {
  const total = cifrasDelCorte(datos, f);
  if (total.fuente !== "nivel" || total.suprimido || !esNumero(total.cifras?.roster)) return { aplica: false };
  const filas = filtrarClases(datos?.clases ?? [], f);
  const ocultas = filas.filter((c) => c.suprimido).length;
  const visible = filas.filter((c) => !c.suprimido).reduce((a, c) => a + (c.roster ?? 0), 0);
  const suprimidos = total.cifras.roster - visible;
  const coherente = suprimidos >= ocultas && suprimidos <= ocultas * 4;
  return { aplica: true, roster: total.cifras.roster, visible, suprimidos, filas_visibles: filas.length - ocultas, filas_suprimidas: ocultas, coherente };
}
export const TEXTO_FILA_SUPRIMIDOS = "Suprimidos (<5 personas, por privacidad)";
export const AYUDA_SIN_CAPTURA = "Personas cuya clase quedó sin captura confiable según el estado de captura de la sesión (Zoom limit, " +
  "dudosa, sin captura, por ocurrir o en curso). Se decide por clase completa: NO es ausencia y no se suma a «no aparecieron». " +
  "Es distinto del «no medible» del calendario, que se decide celda por celda (SI / NO / P).";

// Bloque 2: ciudad x dia. Cada celda es la fila ciudad_dia tal cual (jamas una suma); los totales de fila/columna son los
// niveles 'ciudad' y 'dia' publicados por la vista.
export function tablaCiudadDia(datos, f) {
  const niveles = datos?.niveles ?? []; const op = opcionesFiltros(datos);
  const ciudades = op.ciudades.filter((c) => !f.ciudad || mismaCiudad(c, f.ciudad));
  const dias = op.dias.filter((d) => !f.dia || mismoDia(d, f.dia));
  const celda = (fila) => !fila ? { estado: "vacia" } : fila.suprimido ? { estado: "suprimida" }
    : { estado: "ok", cifras: cifrasDe(fila), pct: pctEntro(fila), semaforo: semaforo(pctEntro(fila)) };
  return {
    dias, filas: ciudades.map((ciudad) => ({ ciudad, total: celda(buscarNivel(niveles, "ciudad", ciudad)),
      celdas: dias.map((dia) => celda(buscarNivel(niveles, "ciudad_dia", ciudad, dia))) })),
    totalesDia: dias.map((dia) => celda(buscarNivel(niveles, "dia", null, dia))),
    totalSemana: !f.ciudad && !f.dia ? celda(buscarNivel(niveles, "semana")) : null,
  };
}

// Bloque 3: clase x ciudad, con estado de captura (chip de V5) y mediana de % de tiempo.
const hh = (h) => (esNumero(h) ? `${String(h).padStart(2, "0")}:00` : "");
export function etiquetaClase(c) { return `${c.dia ?? ""} ${c.fecha ?? ""} ${hh(c.hora_inicio)}${esNumero(c.hora_fin) ? `–${hh(c.hora_fin)}` : ""}`.replace(/\s+/g, " ").trim(); }
export function tablaClases(datos, f) {
  return filtrarClases(datos?.clases ?? [], f).map((c) => ({
    clave: `${c.slot_id}|${c.ciudad}`, slot_id: c.slot_id, ciudad: c.ciudad, clase: etiquetaClase(c), materia: c.materia ?? "", cuenta_zoom: c.cuenta_zoom ?? "",
    tipo: c.tipo ?? "", fecha: c.fecha ?? "", suprimido: Boolean(c.suprimido), cifras: c.suprimido ? null : cifrasDe(c),
    pct: c.suprimido ? null : pctEntro(c), mediana: c.suprimido ? null : (c.mediana_pct_tiempo ?? null),
    confianza: confianzaDeCaptura(c.estado_captura), estado_captura: c.estado_captura ?? null,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clase.localeCompare(b.clase) || porNombre(a.ciudad, b.ciudad));
}

// Bloque 4: barras de ciudades (nivel 'ciudad', o 'ciudad_dia' si hay dia). Suprimida = sin barra y con «<5».
export function barrasCiudades(datos, f) {
  const niveles = datos?.niveles ?? [];
  const ciudades = opcionesFiltros(datos).ciudades.filter((c) => !f.ciudad || mismaCiudad(c, f.ciudad));
  return ciudades.map((ciudad) => {
    const fila = f.dia ? buscarNivel(niveles, "ciudad_dia", ciudad, f.dia) : buscarNivel(niveles, "ciudad", ciudad);
    if (!fila) return { ciudad, estado: "vacia", pct: null, roster: null };
    if (fila.suprimido) return { ciudad, estado: "suprimida", pct: null, roster: null };
    return { ciudad, estado: "ok", pct: pctEntro(fila), roster: fila.roster, semaforo: semaforo(pctEntro(fila)) };
  });
}

// Bloque 5: tendencia entre semanas por ciudad (filas nivel 'ciudad' de varias semanas). Una semana suprimida o sin fila es un
// HUECO (null), nunca 0 ni interpolacion. El filtro de dia no aplica a la serie (se publica por ciudad).
export function tendenciaPorCiudad(serie, f) {
  const filas = (serie ?? []).filter((n) => n.nivel === "ciudad" && (!f.ciudad || mismaCiudad(n.ciudad, f.ciudad)));
  const semanas = unicos(filas.map((n) => n.semana)).sort();
  const ciudades = unicos(filas.map((n) => n.ciudad)).sort(porNombre);
  return { semanas, series: ciudades.map((ciudad) => ({ ciudad, puntos: semanas.map((semana) => {
    const fila = filas.find((n) => n.semana === semana && mismaCiudad(n.ciudad, ciudad));
    if (!fila) return { semana, estado: "vacia", pct: null };
    if (fila.suprimido) return { semana, estado: "suprimida", pct: null };
    return { semana, estado: "ok", pct: pctEntro(fila), roster: fila.roster };
  }) })) };
}

// ---- CSV agregado del corte visible (sin nombres) -------------------------------------------------------------------
export const LEYENDA_ESTADISTICAS = "roster=personas con clase propia | entraron_a_su_clase=entraron a la clase que les corresponde | " +
  "fueron_a_otra=entraron solo a otra clase | no_aparecieron=clase capturada y no entraron | no_medibles=en pantalla «sin captura confiable»: el estado de captura de " +
  "su clase no es confiable (aparte, NO es ausencia; distinto del no medible del calendario, que es por celda) | visitas_recibidas=personas de otra clase que entraron a esta | pct_entro=entraron_a_su_clase / (roster - no_medibles) | " +
  "mediana_pct_tiempo=mediana del % de tiempo en su clase (vacia con menos de 5 medidos)";
export const NOTA_SUPRESION = `Las celdas con menos de 5 personas no se publican y salen como «${TEXTO_SUPRIMIDO}»: no son cero ni vacias. ` +
  "Los totales vienen de la vista (semana / dia / ciudad), no de sumar celdas. La fila SUPRIMIDOS = roster del total - roster de las " +
  "clases visibles (un solo agregado), para que el total cuadre.";
export const HEADER_CSV_ESTADISTICAS = ["bloque", "semana", "materia", "ciudad", "dia", "clase", "cuenta_zoom", "tipo", "estado_captura", ...CIFRAS, "pct_entro", "mediana_pct_tiempo", "detalle"];

const celdaCsv = (v, suprimido) => (suprimido ? TEXTO_SUPRIMIDO : v == null ? "" : v);
function filaCsv(bloque, base, o) {
  const c = o.cifras;
  return [bloque, base.semana, base.materia, o.ciudad ?? "", o.dia ?? "", o.clase ?? "", o.cuenta_zoom ?? "", o.tipo ?? "", o.estado_captura ?? "",
    ...CIFRAS.map((k) => celdaCsv(c?.[k], o.suprimido)), celdaCsv(o.pct, o.suprimido), o.mediana === undefined ? "" : celdaCsv(o.mediana, o.suprimido), ""];
}
export function construirCsvEstadisticas(datos, f) {
  const base = { semana: datos.semana, materia: datos.materia ?? "" };
  const filtroTexto = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ") || "sin filtros";
  const texto = (bloque, detalle) => line([bloque, base.semana, ...Array(HEADER_CSV_ESTADISTICAS.length - 3).fill(""), detalle]);
  const out = [line(HEADER_CSV_ESTADISTICAS), texto("LEYENDA", LEYENDA_ESTADISTICAS), texto("SUPRESION", NOTA_SUPRESION), texto("FILTROS", filtroTexto)];
  const total = cifrasDelCorte(datos, f);
  if (total.fuente !== "ninguna") out.push(line(filaCsv("TOTAL", base, { ciudad: f.ciudad, dia: f.dia, suprimido: total.suprimido, cifras: total.cifras,
    pct: total.cifras ? pctEntro(total.cifras) : null })));
  const sup = suprimidosDelCorte(datos, f);
  if (sup.aplica) out.push(texto("SUPRIMIDOS", `${TEXTO_FILA_SUPRIMIDOS}: ${sup.suprimidos} personas en ${sup.filas_suprimidas} filas de clase; ` +
    `roster ${sup.roster} = ${sup.visible} visibles + ${sup.suprimidos} suprimidos${sup.coherente ? "" : " (DESCUADRE: revisar)"}`));
  const cd = tablaCiudadDia(datos, f);
  for (const fila of cd.filas) for (let i = 0; i < cd.dias.length; i++) {
    const c = fila.celdas[i]; if (c.estado === "vacia") continue;
    out.push(line(filaCsv("CIUDAD_DIA", base, { ciudad: fila.ciudad, dia: cd.dias[i], suprimido: c.estado === "suprimida", cifras: c.cifras, pct: c.pct })));
  }
  for (const c of tablaClases(datos, f)) out.push(line(filaCsv("CLASE", base, { ciudad: c.ciudad, clase: c.clase, cuenta_zoom: c.cuenta_zoom, tipo: c.tipo,
    estado_captura: c.estado_captura, dia: "", suprimido: c.suprimido, cifras: c.cifras, pct: c.pct, mediana: c.mediana })));
  return { contenido: BOM + out.join("\r\n") + "\r\n", archivo: "estadisticas" };
}

// Texto del estado vacio segun la causa (siempre explicado).
export function explicarVacio(datos, f) {
  if (!datos || (datos.niveles ?? []).length === 0) return "Esta semana todavía no tiene cortes calculados. Se generan cuando se congela el roster y hay clases capturadas.";
  if (filtrosActivos(f)) return "Ningún dato coincide con estos filtros. Prueba quitando alguno (por ejemplo el día o la cuenta Zoom).";
  return "No hay filas para mostrar en esta semana.";
}
