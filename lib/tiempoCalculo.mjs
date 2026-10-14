// Agregacion PURA de la vista "Tiempo en clase" (TOC-140). Sin I/O, sin nombres.
//
// Entradas (todas SIN PII; las arma lib/servidor/leerTiempo.ts o lib/tiempo-demo.mjs):
//  - clases:   filas de asist_tiempo_clase (agregado por clase del backend; solo sesiones PROPIAS).
//  - personas: filas persona-sesion SIN nombre de v_asist_tiempo_persona
//              { sesion_id, slot_id (sala donde se midio), fecha, es_visita, franja_propia, ciudad,
//                estado_tiempo, cumple_50, motivo, pct_tiempo, segundos }.
//  - franjas:  [{ slot_id, fecha, cuenta_zoom, horario_texto }].
// Los veredictos NO se recalculan: se cuentan los estados guardados por el backend.
// Dos lentes que no se mezclan: clase/dia/semana (sesiones PROPIAS) vs veredicto semanal por persona
// (MEJOR sesion, visitas incluidas; viene de asist_semana_resumen.tiempo_*).
import { mismaCiudad } from "./rolesCalculo.mjs";
import { construirHistograma } from "./histogramaTiempo.mjs";
import { MUESTRA_MINIMA, cuadreTiempo, nivelCobertura } from "./tiempoVista.mjs";

const num = (v) => (v == null || v === "" ? null : Number(v));
const n0 = (v) => Number(v ?? 0) || 0;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const esMedido = (f) => f.estado_tiempo === "cumple" || f.estado_tiempo === "rojo_tiempo";

// Interpolacion lineal, identica a clasificar.py::cuantil (k=(n-1)*p).
export function cuantil(ordenados, p) {
  if (!ordenados.length) return null;
  const k = (ordenados.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, ordenados.length - 1);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (k - lo);
}

export function percentiles(pcts) {
  if (pcts.length < MUESTRA_MINIMA) return { mediana: null, p10: null, p90: null };
  const s = [...pcts].sort((a, b) => a - b);
  return { mediana: r1(cuantil(s, 0.5)), p10: r1(cuantil(s, 0.1)), p90: r1(cuantil(s, 0.9)) };
}

// Fila de asist_tiempo_clase -> forma interna (n_ingresaron = ingresaron_propios: solo propias).
export function normalizarClaseBackend(f) {
  return {
    sesion_id: f.sesion_id, slot_id: f.slot_id, fecha: f.fecha, estado_captura: f.estado_captura ?? null,
    roster: n0(f.roster_n), n_ingresaron: n0(f.ingresaron_propios), n_medibles: n0(f.n_medibles), n_cumplen: n0(f.n_cumplen),
    n_rojo: n0(f.n_rojo), n_sin_dato: n0(f.n_sin_dato), n_pendiente: n0(f.n_pendiente),
    n_parciales: n0(f.n_parciales), n_no_medibles: n0(f.n_no_medibles),
    visitas: n0(f.visitas), visitas_cumplen: n0(f.visitas_cumplen), visitas_rojo: n0(f.visitas_rojo), visitas_sin_dato: n0(f.visitas_sin_dato),
    mediana: num(f.mediana_pct), p10: num(f.p10_pct), p90: num(f.p90_pct), hist: Array.isArray(f.hist) ? f.hist : null,
    fin_clase_min: num(f.fin_clase_min), fin_confiable: f.fin_confiable !== false, clase_evaluable: f.clase_evaluable === true,
    motivo_no_evaluable: f.motivo_no_evaluable ?? null,
  };
}

// Veredicto semanal por persona (MEJOR sesion) desde asist_semana_resumen.tiempo_*; null si aun no se calculo.
export function normalizarResumenPersonas(r) {
  if (!r || r.tiempo_roster == null) return null;
  return {
    umbral_pct: n0(r.tiempo_umbral_pct), roster: n0(r.tiempo_roster), cumplen: n0(r.tiempo_cumplen), rojo: n0(r.tiempo_rojo),
    sin_dato: n0(r.tiempo_sin_dato), ausentes: n0(r.tiempo_ausentes), sin_clase: n0(r.tiempo_sin_clase),
    pendientes: n0(r.tiempo_pendientes), con_entrada: n0(r.tiempo_con_entrada), medidos: n0(r.tiempo_medidos),
    cobertura: num(r.tiempo_cobertura), definitivo: r.tiempo_definitivo === true,
  };
}

const CAMPOS_ORIGEN = ["personas", "cumplen", "rojo", "sin_dato", "pendientes", "con_pct", "sin_pct"];
// Filas de v_asist_tiempo_origen (a lo sumo 3 por semana) -> { con_propia, solo_visita, sin_sesion, total }. null si no hay filas.
export function normalizarOrigen(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return null;
  const vacio = () => Object.fromEntries(CAMPOS_ORIGEN.map((c) => [c, 0]));
  const o = { con_propia: vacio(), solo_visita: vacio(), sin_sesion: vacio(), total: vacio() };
  for (const f of filas) {
    if (!(f.origen in o) || f.origen === "total") continue;
    for (const c of CAMPOS_ORIGEN) { const v = n0(f[c]); o[f.origen][c] = v; o.total[c] += v; }
  }
  return o;
}

function contar(filas) {
  const propias = filas.filter((f) => !f.es_visita);
  const visitas = filas.filter((f) => f.es_visita);
  const n = (lista, estado) => lista.filter((f) => f.estado_tiempo === estado).length;
  const c = { n_ingresaron: propias.length, n_cumplen: n(propias, "cumple"), n_rojo: n(propias, "rojo_tiempo"),
    n_sin_dato: n(propias, "sin_dato_tiempo"), n_pendiente: n(propias, "pendiente"), visitas: visitas.length,
    visitas_cumplen: n(visitas, "cumple"), visitas_rojo: n(visitas, "rojo_tiempo"), visitas_sin_dato: n(visitas, "sin_dato_tiempo") };
  c.n_medibles = c.n_cumplen + c.n_rojo;
  return c;
}
const pctsMedidos = (filas) => filas.filter((f) => !f.es_visita && esMedido(f) && f.pct_tiempo != null).map((f) => Number(f.pct_tiempo));

const SUMAS = ["n_ingresaron", "n_medibles", "n_cumplen", "n_rojo", "n_sin_dato", "n_pendiente",
  "visitas", "visitas_cumplen", "visitas_rojo", "visitas_sin_dato"];
function sumar(filas, conRoster) {
  const t = Object.fromEntries(SUMAS.map((k) => [k, filas.reduce((a, f) => a + n0(f[k]), 0)]));
  t.roster = conRoster ? filas.reduce((a, f) => a + n0(f.roster), 0) : null;
  return t;
}
function derivados(c) {
  const cobertura = c.n_ingresaron > 0 ? c.n_medibles / c.n_ingresaron : null;
  return { ...c, cobertura, nivel_cobertura: nivelCobertura(c),
    sin_medicion: c.n_ingresaron > 0 && c.n_medibles === 0, sin_ingresos: c.n_ingresaron === 0,
    muestra_pequena: c.n_medibles > 0 && c.n_medibles < MUESTRA_MINIMA };
}

// Compara los conteos recalculados desde las filas por persona contra asist_tiempo_clase (solo sin filtro).
export function compararConBackend(personas, clasesBackend) {
  if (!clasesBackend.length) return { estado: "SIN_COMPARAR", detalle: [] };
  const porSlot = new Map();
  for (const p of personas) porSlot.set(p.slot_id, [...(porSlot.get(p.slot_id) ?? []), p]);
  const detalle = [];
  for (const b of clasesBackend) {
    const l = contar(porSlot.get(b.slot_id) ?? []);
    for (const k of ["n_ingresaron", "n_medibles", "n_cumplen", "n_rojo", "n_sin_dato", "n_pendiente", "visitas"])
      if (l[k] !== b[k]) detalle.push(`${b.slot_id}.${k}: clase=${b[k]} personas=${l[k]}`);
  }
  return { estado: detalle.length ? "DISCREPA" : "OK", detalle };
}

// Arma la respuesta completa de /api/tiempo (sin PII). `filtro` = { ciudad, franja, cuenta } sobre la franja PROPIA.
export function armarTiempoSemana({ clases, personas, franjas, filtro = {}, info }) {
  const filtroActivo = Boolean(filtro.ciudad || filtro.franja || filtro.cuenta);
  const cuentaDe = new Map(franjas.map((f) => [f.slot_id, f.cuenta_zoom]));
  const horarioDe = new Map(franjas.map((f) => [f.slot_id, f.horario_texto]));
  const backend = clases.map(normalizarClaseBackend);
  const pasa = (p) => (!filtro.ciudad || mismaCiudad(p.ciudad, filtro.ciudad)) && (!filtro.franja || p.franja_propia === filtro.franja)
    && (!filtro.cuenta || cuentaDe.get(p.franja_propia) === filtro.cuenta);
  const filtradas = filtroActivo ? personas.filter(pasa) : personas;
  const porSlot = new Map();
  for (const p of filtradas) porSlot.set(p.slot_id, [...(porSlot.get(p.slot_id) ?? []), p]);
  const claseVisible = (b) => (filtro.franja ? b.slot_id === filtro.franja : filtro.cuenta ? cuentaDe.get(b.slot_id) === filtro.cuenta : true)
    || (porSlot.get(b.slot_id)?.length ?? 0) > 0;

  const porClase = backend.filter((b) => !filtroActivo || claseVisible(b)).map((b) => {
    const filas = porSlot.get(b.slot_id) ?? [];
    const base = filtroActivo ? { ...contar(filas), roster: null, ...percentiles(pctsMedidos(filas)) }
      : { ...b, mediana: b.n_medibles >= MUESTRA_MINIMA ? b.mediana : null, p10: b.n_medibles >= MUESTRA_MINIMA ? b.p10 : null,
        p90: b.n_medibles >= MUESTRA_MINIMA ? b.p90 : null };
    return derivados({ slot_id: b.slot_id, fecha: b.fecha, horario_texto: horarioDe.get(b.slot_id) ?? b.slot_id,
      estado_captura: b.estado_captura, fin_clase_min: b.fin_clase_min, fin_confiable: b.fin_confiable,
      clase_evaluable: b.clase_evaluable, motivo_no_evaluable: b.motivo_no_evaluable, ...base });
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));

  const slotsVisibles = new Set(porClase.map((c) => c.slot_id));
  const pcts = (slots) => pctsMedidos(filtradas.filter((p) => slots.has(p.slot_id)));
  const fechas = [...new Set(porClase.map((c) => c.fecha))].sort();
  const porDia = fechas.map((fecha) => {
    const delDia = porClase.filter((c) => c.fecha === fecha);
    const suma = sumar(delDia, !filtroActivo);
    return derivados({ fecha, ...suma, ...percentiles(pcts(new Set(delDia.map((c) => c.slot_id)))) });
  });
  const suma = sumar(porClase, !filtroActivo);
  const pctsSemana = pcts(slotsVisibles);
  const semanaAgregada = derivados({ ...suma, ...percentiles(pctsSemana) });
  const histograma = semanaAgregada.n_medibles >= MUESTRA_MINIMA ? construirHistograma(pctsSemana) : null;
  const errores = [...porClase, ...porDia, semanaAgregada].flatMap((c) => cuadreTiempo(c).errores);
  const ciudades = [...new Set(personas.map((p) => p.ciudad).filter(Boolean))].sort();
  return {
    disponible: true, hay_tiempos: backend.length > 0, semana: info.semana, roster: info.roster ?? null,
    congelada_en: info.congelada_en ?? null, reconstruida: Boolean(info.reconstruida), provisional: Boolean(info.provisional),
    semana_cerrada_en: info.cerrada_en ?? null, umbral_pct: info.umbral_pct ?? null,
    semana_agregada: semanaAgregada, por_dia: porDia, por_clase: porClase, histograma,
    visitas: { sesiones: semanaAgregada.visitas, cumplen: semanaAgregada.visitas_cumplen, rojo: semanaAgregada.visitas_rojo,
      sin_dato: semanaAgregada.visitas_sin_dato },
    semana_personas: info.resumen_personas ?? null,
    origen_personas: info.origen_personas ?? null,
    cuadre: { ok: errores.length === 0, errores },
    cuadre_backend: filtroActivo ? { estado: "SIN_COMPARAR", detalle: [] } : compararConBackend(personas, backend),
    filtro: { ciudad: filtro.ciudad ?? null, franja: filtro.franja ?? null, cuenta: filtro.cuenta ?? null },
    ciudades, cuentas: [...new Set(franjas.map((f) => f.cuenta_zoom))].sort(),
    franjas: [...franjas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id))
      .map(({ slot_id, fecha, cuenta_zoom, horario_texto }) => ({ slot_id, fecha, cuenta_zoom, horario_texto })),
  };
}

// Serie semana a semana desde v_asist_tiempo_semana. Cada semana con SU propia base.
export function armarSerieTiempo(filas) {
  return filas.map((f) => {
    const c = { n_ingresaron: n0(f.n_ingresaron), n_medibles: n0(f.n_medibles), n_cumplen: n0(f.n_cumplen), n_rojo: n0(f.n_rojo),
      n_sin_dato: n0(f.n_sin_dato), n_pendiente: n0(f.n_pendiente) };
    return { semana: f.semana, roster: f.tiempo_roster == null ? n0(f.roster_franjas) : n0(f.tiempo_roster), ...c,
      cobertura: c.n_ingresaron > 0 ? c.n_medibles / c.n_ingresaron : null, provisional: f.provisional !== false,
      estado_semana: f.estado_semana ?? null, congelada_en: f.congelada_en ?? null, cerrada_en: f.cerrada_en ?? null };
  }).sort((a, b) => a.semana.localeCompare(b.semana));
}
