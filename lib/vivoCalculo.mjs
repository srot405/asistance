// Calculo puro de la pestana "En vivo" (TOC-142): sin I/O, sin Supabase. Solo CONTEOS: nunca devuelve correos,
// nombres ni persona_id. Los eventos entran ya "compactados" (correo -> hash) por compactarEvento; el servidor
// en memoria solo guarda hashes.
// Puertos literales (con tests de paridad) de: backend/etl/clasificar_semana.py (cuenta_de_host, _es_avanzado,
// resolver_franja_sin_cuenta), admin-usable/scripts/zoom-asistencia/horario_maestro.py (resolver_franja,
// normalizar_cuenta, normalizar_dia) y llenar_asistencia2.py (es_clase).
import { createHash } from "node:crypto";

export const COT_MS = 5 * 3600000; // UTC-5 fijo
export const MIN = 60000;
export const MARGEN_VENTANA_MIN = 30;
export const PROXIMA_MIN = 60;
export const UMBRAL_HUERFANOS = 0.3;
export const MIN_EVENTOS_COBERTURA = 5;
export const DOMINIO_PERSONAL = "@tocaunavida.org";
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_NORM = { miercoles: "miércoles", sabado: "sábado" };
const CURSOS_CLASE = ["DESARROLLO WEB", "BACKEND"];
const CUENTAS = { "jovenes creativos": "jovenescreativos", jovenescreativos: "jovenescreativos", comunicaciones: "comunicaciones", soporte: "soporte" };

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const espacios = (t) => String(t ?? "").trim().replace(/\s+/g, " ");

export const normalizarCorreo = (c) => String(c ?? "").trim().toLowerCase();
export const hashClave = (texto) => createHash("sha256").update(texto).digest("hex").slice(0, 16);
export const hashCorreo = (correo) => { const c = normalizarCorreo(correo); return c ? hashClave(c) : null; };

export function esClase(curso) {
  const t = espacios(sinAcentos(curso)).toUpperCase();
  return CURSOS_CLASE.some((p) => t.startsWith(p));
}
export function normalizarCuenta(valor) {
  const t = espacios(valor).toLowerCase().replaceAll("_", " ");
  return CUENTAS[t] ?? t.replaceAll(" ", "");
}
export function normalizarDia(valor) {
  const t = espacios(valor).toLowerCase().replace("é", "e").replace("á", "a");
  return DIAS_NORM[t] ?? t;
}
const esAvanzado = (t) => String(t ?? "").toLowerCase().includes("avanzado");

export function cuentaDeHost(host) {
  const v = String(host ?? "").trim().toLowerCase();
  for (const token of ["comunicaciones", "jovenescreativos", "jovenes creativos", "soporte"]) if (v.includes(token)) return normalizarCuenta(token);
  return "";
}

// momento = epoch ms; dia y hora en COT
function diaYHora(ms) {
  const d = new Date(ms - COT_MS);
  return { dia: DIAS[(d.getUTCDay() + 6) % 7], hora: d.getUTCHours() + d.getUTCMinutes() / 60 };
}
export const fechaCOT = (ms) => new Date(ms - COT_MS).toISOString().slice(0, 10);

// filas = [{ "Día", "Hora inicio (24h COL)", "Cuenta Zoom", "Tipo", slot_id }]
export function resolverFranja(filas, cuenta, momentoMs, tolerancia = 1.5) {
  const cuentaNorm = normalizarCuenta(cuenta);
  const { dia, hora } = diaYHora(momentoMs);
  const cands = [];
  for (const f of filas) {
    if (normalizarCuenta(f["Cuenta Zoom"]) !== cuentaNorm) continue;
    if (normalizarDia(f["Día"]) !== dia) continue;
    const ini = f["Hora inicio (24h COL)"];
    if (ini == null) continue;
    const dif = Math.abs(Number(ini) - hora);
    if (dif <= tolerancia) cands.push([dif, f]);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a[0] - b[0]);
  if (cands.length > 1 && cands[0][0] === cands[1][0]) return null;
  return cands[0][1];
}
export function resolverFranjaSinCuenta(filas, momentoMs, curso, tolerancia = 1.0) {
  const { dia, hora } = diaYHora(momentoMs);
  const av = esAvanzado(curso);
  const cands = filas.filter((f) => normalizarDia(f["Día"]) === dia && f["Hora inicio (24h COL)"] != null
    && Math.abs(Number(f["Hora inicio (24h COL)"]) - hora) <= tolerancia && esAvanzado(f.Tipo) === av);
  return cands.length === 1 ? cands[0] : null;
}

export const filasHorario = (franjas) => franjas.map((f) => ({ slot_id: f.slot_id, "Día": f.dia, "Hora inicio (24h COL)": f.hora_inicio,
  "Cuenta Zoom": f.cuenta_zoom, Tipo: f.tipo ?? "" }));

// sala = { host, topic, primerMs }  ->  slot_id | null
export function asociarSalaAFranja(sala, franjas) {
  const filas = filasHorario(franjas);
  const cuenta = cuentaDeHost(sala.host);
  const r = cuenta ? resolverFranja(filas, cuenta, sala.primerMs) : resolverFranjaSinCuenta(filas, sala.primerMs, sala.topic);
  return r ? r.slot_id : null;
}

export function ventanaClase(franja) {
  const base = Date.parse(`${franja.fecha}T00:00:00Z`) + COT_MS;
  const inicioMs = base + franja.hora_inicio * 3600000;
  const finMs = base + (franja.hora_fin ?? franja.hora_inicio + 2) * 3600000;
  return { inicioMs, finMs, desdeMs: inicioMs - MARGEN_VENTANA_MIN * MIN, hastaMs: finMs + MARGEN_VENTANA_MIN * MIN };
}

// null = no se muestra (otro dia o a mas de 60 min)
export function estadoClase(franja, ahoraMs, { salaActiva = false, eventosEnVentana = 0 } = {}) {
  const v = ventanaClase(franja);
  if (ahoraMs > v.hastaMs) return fechaCOT(ahoraMs) === franja.fecha ? "terminada" : null;
  if (ahoraMs >= v.desdeMs) {
    if (salaActiva || eventosEnVentana > 0) return "abierta";
    return ahoraMs < v.inicioMs ? "proxima" : "sin_sala";
  }
  return v.inicioMs - ahoraMs <= PROXIMA_MIN * MIN ? "proxima" : null;
}
// ¿hay que leer eventos? solo si la hora cae dentro de la ventana de alguna franja
export const ventanaAbiertaAhora = (franja, ahoraMs) => { const v = ventanaClase(franja); return ahoraMs >= v.desdeMs && ahoraMs <= v.hastaMs; };

// fila cruda de zoom_live_log -> evento compacto (sin correo ni nombre en claro)
export function compactarEvento(f) {
  const correo = normalizarCorreo(f.correo);
  const nombre = espacios(sinAcentos(f.nombre)).toLowerCase();
  let clave = null;
  if (correo) clave = "c:" + hashClave(correo);
  else if (nombre) clave = "n:" + hashClave(nombre);
  return { id: Number(f.id), evento: f.evento, ms: Number(f.hora_ms), clave, correoHash: correo ? hashClave(correo) : null,
    personal: correo.endsWith(DOMINIO_PERSONAL) };
}

// eventos compactos de UNA clase (una o varias salas) -> conteos. rosterPorCorreo: Map|Set de hashes de correo del roster.
export function clasificarEventos(eventos, rosterPorCorreo, ahora) {
  const ahoraMs = ahora instanceof Date ? ahora.getTime() : ahora;
  const orden = eventos.filter((e) => ahoraMs == null || e.ms <= ahoraMs).sort((a, b) => a.ms - b.ms || a.id - b.id);
  const personas = new Map(); // clave -> { grupo, saldo }
  let lefts = 0, huerfanos = 0, ultimo = null;
  for (const e of orden) {
    const clave = e.clave ?? "f:" + e.id; // sin correo ni nombre: cada fila cuenta como una persona
    let p = personas.get(clave);
    if (!p) {
      const grupo = e.personal ? "personal" : (e.correoHash && rosterPorCorreo.has(e.correoHash) ? "roster" : "desconocidos");
      p = { grupo, saldo: 0 };
      personas.set(clave, p);
    }
    if (e.evento === "joined") p.saldo += 1;
    else {
      lefts += 1;
      if (p.saldo > 0) p.saldo -= 1; else huerfanos += 1; // nunca negativo
    }
    if (ultimo == null || e.ms > ultimo) ultimo = e.ms;
  }
  const r = { roster: { maximo: 0, ahora: 0 }, desconocidos: { maximo: 0, ahora: 0 }, personal: { maximo: 0, ahora: 0 } };
  for (const p of personas.values()) { r[p.grupo].maximo += 1; if (p.saldo > 0) r[p.grupo].ahora += 1; } // tope 1 por persona
  const n = orden.length;
  const ratio = lefts ? huerfanos / lefts : 0;
  return { ...r, eventos: n, lefts, huerfanos, ratio_huerfanos: ratio, ultima_actividad_ms: ultimo,
    cobertura_baja_eventos: n >= MIN_EVENTOS_COBERTURA && ratio >= UMBRAL_HUERFANOS };
}

const NOMBRE_DIA = (d) => d.charAt(0).toUpperCase() + d.slice(1);
const hh = (h) => String(h).padStart(2, "0");
export function etiquetaClase(f) {
  const suf = /-(uno|dos)$/.exec(f.slot_id)?.[1];
  const tipo = esAvanzado(f.tipo) ? "Avanzado" : "Básico";
  return `${NOMBRE_DIA(f.dia)} ${hh(f.hora_inicio)}:00-${hh(f.hora_fin)}:00 · ${tipo}${suf ? ` ${suf}` : ""}`;
}

// salas: [{ uuid, host, topic, activo, eventos: [compactos] }] ya filtradas por esClase.
// lecturaEventos=false => no se leyo zoom_live_log (fuera de horario): las terminadas salen sin cifras salvo estado en memoria.
export function armarRespuestaVivo({ semana, franjas, salas, rosterPorCorreo, ahoraMs, actualizadoMs, lecturaEventos = true, avisoGeneral = null }) {
  const porSlot = new Map();
  let sinFranja = 0;
  for (const s of salas) {
    const ms = s.eventos.length ? Math.min(...s.eventos.map((e) => e.ms)) : ahoraMs;
    const slot = asociarSalaAFranja({ host: s.host, topic: s.topic, primerMs: ms }, franjas);
    if (!slot) { sinFranja += 1; continue; }
    if (!porSlot.has(slot)) porSlot.set(slot, []);
    porSlot.get(slot).push(s);
  }
  const clases = [];
  const ordenadas = [...franjas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio - b.hora_inicio || a.slot_id.localeCompare(b.slot_id));
  for (const f of ordenadas) {
    const v = ventanaClase(f);
    const sl = porSlot.get(f.slot_id) ?? [];
    const evs = sl.flatMap((s) => s.eventos);
    const enVentana = evs.filter((e) => e.ms >= v.desdeMs && e.ms <= v.hastaMs).length;
    const salaActiva = sl.some((s) => s.activo);
    const estado = estadoClase(f, ahoraMs, { salaActiva, eventosEnVentana: enVentana });
    if (!estado) continue;
    const c = clasificarEventos(evs, rosterPorCorreo, ahoraMs);
    const soporte = normalizarCuenta(f.cuenta_zoom) === "soporte";
    const avisos = [];
    if (c.cobertura_baja_eventos) avisos.push(`Muchos 'salió' sin 'entró' previo (${Math.round(c.ratio_huerfanos * 100)} %): el webhook perdió entradas, puede subestimar a los presentes ahora; el máximo es la cifra firme.`);
    if (soporte) avisos.push("Sala de Soporte: el webhook pierde 45-60 % de las entradas, puede subestimar; el máximo es la cifra firme.");
    if (!lecturaEventos && estado === "terminada" && !evs.length) avisos.push("Máximo final no cargado: no se consulta la bitácora fuera del horario de clase.");
    if (estado === "sin_sala") avisos.push("En ventana de clase, pero no se encontró la sala de Zoom.");
    clases.push({
      slot_id: f.slot_id, etiqueta: etiquetaClase(f), cuenta_zoom: f.cuenta_zoom,
      inicio: new Date(v.inicioMs).toISOString(), fin: new Date(v.finMs).toISOString(), estado, sala_activa: salaActiva,
      roster_total: Number(f.roster_n ?? 0), roster_maximo: c.roster.maximo, roster_ahora_aprox: c.roster.ahora,
      desconocidos_maximo: c.desconocidos.maximo, desconocidos_ahora_aprox: c.desconocidos.ahora,
      personal_maximo: c.personal.maximo, personal_ahora_aprox: c.personal.ahora,
      ultima_actividad: c.ultima_actividad_ms == null ? null : new Date(c.ultima_actividad_ms).toISOString(),
      eventos: c.eventos, cobertura_baja: c.cobertura_baja_eventos || soporte, aviso: avisos.length ? avisos.join(" ") : null,
    });
  }
  const general = [avisoGeneral, sinFranja ? `${sinFranja} sala(s) de clase sin franja asignable (no se cuentan).` : null].filter(Boolean);
  return { disponible: true, actualizado_en: new Date(actualizadoMs ?? ahoraMs).toISOString(), semana, hora_servidor: new Date(ahoraMs).toISOString(),
    clases, aviso_general: general.length ? general.join(" ") : null };
}
