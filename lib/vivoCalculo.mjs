// Calculo puro de la pestana "En vivo" (TOC-142): sin I/O, sin Supabase. Solo CONTEOS: nunca devuelve correos,
// nombres ni persona_id. Los eventos entran ya "compactados" (correo -> hash) por compactarEvento; el servidor
// en memoria solo guarda hashes.
// Puertos literales (con tests de paridad) de: backend/etl/clasificar_semana.py (cuenta_de_host, _es_avanzado,
// resolver_franja_sin_cuenta), admin-usable/scripts/zoom-asistencia/horario_maestro.py (resolver_franja,
// normalizar_cuenta, normalizar_dia) y llenar_asistencia2.py (es_clase).
import { createHmac, randomBytes } from "node:crypto";
import { AVISO_CIFRA_NO_DISPONIBLE } from "./vivoVista.mjs";

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
// HMAC con secreto SOLO en memoria: VIVO_HASH_SECRET si existe; si no, uno aleatorio por proceso. Los hashes nunca salen del
// servidor ni se guardan, asi que cambiar de secreto entre procesos no rompe nada (roster y eventos se hashean en el mismo proceso).
const SECRETO_HASH = process.env.VIVO_HASH_SECRET || randomBytes(32).toString("hex");
export const hashClave = (texto) => createHmac("sha256", SECRETO_HASH).update(texto).digest("hex").slice(0, 16);
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

// Nombres que Zoom pone por defecto (o que no identifican a nadie): sin correo NO se agrupan por nombre, porque "iPhone" de dos
// personas distintas colapsaria en una sola. Efecto: cada entrada anonima cuenta como una persona y cada salida anonima descuenta
// a la persona anonima que lleva mas tiempo presente (si no hay ninguna, es un 'salio' huerfano y no crea persona).
const NOMBRE_GENERICO = /^(iphone|ipad|android|invitado|guest|usuario|user|zoom user|zoom|participante|participant|unknown|desconocido|galaxy|samsung)( ?\d+)?$/;
export const esNombreGenerico = (nombreNormalizado) => !nombreNormalizado || NOMBRE_GENERICO.test(nombreNormalizado);

// Robots que toman notas y entran a las clases como asistentes (vistos en zoom_live_log 2026-09/10: "Read.ai Meeting Notes" sin
// correo, "Fireflies.ai Notetaker <nombre>" con fred@fireflies.ai, "<nombre>'s meeting notes - tldv"). Cuentan como PERSONAL, igual
// que @tocaunavida.org: Zoom los muestra como participantes, pero no son estudiantes. Patrones estrictos (nada de "otter" suelto,
// que atraparía un apellido): una sola regla para En vivo y Lista en vivo.
const BOT_NOTAS = /(fireflies\.ai|otter\.ai|read\.ai|fathom\.video|notetaker|note taker|meeting notes|\btl;?dv\b|meetgeek|\bbot\b)/i;
export const esBot = (correo, nombre) => BOT_NOTAS.test(String(correo ?? "")) || BOT_NOTAS.test(String(nombre ?? ""));
export const esPersonal = (correo, nombre) => normalizarCorreo(correo).endsWith(DOMINIO_PERSONAL) || esBot(correo, nombre);

// fila cruda de zoom_live_log -> evento compacto (sin correo ni nombre en claro)
export function compactarEvento(f) {
  const correo = normalizarCorreo(f.correo);
  const nombre = espacios(sinAcentos(f.nombre)).toLowerCase();
  let clave = null;
  if (correo) clave = "c:" + hashClave(correo);
  else if (!esNombreGenerico(nombre)) clave = "n:" + hashClave(nombre);
  return { id: Number(f.id), evento: f.evento, ms: Number(f.hora_ms), clave, correoHash: correo ? hashClave(correo) : null,
    personal: esPersonal(correo, f.nombre) };
}

// ---------- Identidad por persona (fase 1.4 del plan de veracidad): la MISMA regla que "Lista en vivo" (vivoNominal.identificar), pero
// solo con hashes. Orden: 1) correo del evento = correo del roster; 2) correo del evento = correo de un registrante de Zoom del dia
// con cedula, y esa cedula (sin ceros adelante) = persona_id del roster; 3) nada -> desconocido. La persona (no el correo) es la
// unidad: dos correos de la misma persona cuentan como una. En memoria: hashCorreo -> hashPersona, hashCedula -> hashPersona,
// hashPersona -> Set(slot_id) y, del registro, hashCorreo -> hashCedula. Nunca el texto.
export const cedulaSinCeros = (c) => String(c ?? "").replace(/\D/g, "").replace(/^0+/, "");
export const hashCedula = (c) => { const k = cedulaSinCeros(c); return k ? hashClave("ced:" + k) : null; };

// filas de asist_roster { persona_id, correo_norm, slot_id } -> { porCorreo, porCedula, slots } (todo hashes). Fila sin persona_id
// (legado/pruebas): la persona es su correo.
export function indexarRosterVivo(filas) {
  const porCorreo = new Map(), porCedula = new Map(), slots = new Map();
  for (const f of filas ?? []) {
    const hc = hashCorreo(f.correo_norm);
    const id = String(f.persona_id ?? "");
    const hp = id ? hashClave("pid:" + id) : hc ? hashClave("pc:" + hc) : null;
    if (!hp) continue;
    if (!slots.has(hp)) slots.set(hp, new Set());
    if (f.slot_id) slots.get(hp).add(f.slot_id);
    if (hc) porCorreo.set(hc, hp);
    const hk = id ? hashCedula(id) : null;
    if (hk) porCedula.set(hk, hp);
  }
  return { porCorreo, porCedula, slots };
}
// filas de zoom_registrantes { correo_norm, cedula_digitos } -> Map hashCorreo -> hashCedula|null (el ultimo con cedula gana, como
// vivoNominal.indexarRegistrantes)
export function indexarRegistroVivo(filas) {
  const m = new Map();
  for (const r of filas ?? []) {
    const hc = hashCorreo(r.correo_norm);
    if (!hc) continue;
    const hk = hashCedula(r.cedula_digitos);
    if (!m.has(hc) || hk) m.set(hc, hk);
  }
  return m;
}
export const conRegistro = (identidad, registro) => ({ ...identidad, registro: registro ?? new Map() });
const esIdentidad = (x) => x != null && x.porCorreo instanceof Map && x.slots instanceof Map;
// hashCorreo del evento -> hashPersona del roster | null
export function personaDeCorreo(identidad, correoHash) {
  if (!correoHash || !esIdentidad(identidad)) return null;
  const p = identidad.porCorreo.get(correoHash);
  if (p) return p;
  const hk = identidad.registro?.get(correoHash);
  return hk ? identidad.porCedula.get(hk) ?? null : null;
}

// Roster: identidad (indexarRosterVivo + conRegistro), Map<hashCorreo, Set<slot_id>> (el alumno puede estar en el roster de varias franjas) o, por compatibilidad, un Set de hashes
// (sin franjas: todo el roster cuenta como de esta clase).
function grupoRoster(rosterPorCorreo, hash, slotId) {
  if (esIdentidad(rosterPorCorreo)) {
    const hp = personaDeCorreo(rosterPorCorreo, hash);
    if (!hp) return null;
    const slots = rosterPorCorreo.slots.get(hp);
    return slotId == null || !slots ? "roster" : slots.has(slotId) ? "roster" : "otra";
  }
  if (!hash || !rosterPorCorreo.has(hash)) return null;
  if (typeof rosterPorCorreo.get !== "function" || slotId == null) return "roster";
  const slots = rosterPorCorreo.get(hash);
  if (slots == null || typeof slots.has !== "function") return "roster";
  return slots.has(slotId) ? "roster" : "otra";
}

// eventos compactos de UNA clase (una o varias salas) -> conteos. rosterPorCorreo: ver arriba. slotId: franja de la clase.
// Grupos: roster (de ESTA franja), otra (del roster de la semana pero de otra franja), desconocidos, personal.
export function clasificarEventos(eventos, rosterPorCorreo, ahora, slotId = null) {
  const ahoraMs = ahora instanceof Date ? ahora.getTime() : ahora;
  const orden = eventos.filter((e) => ahoraMs == null || e.ms <= ahoraMs).sort((a, b) => a.ms - b.ms || a.id - b.id);
  const personas = new Map(); // clave -> { grupo, saldo }
  const anonimos = []; // personas anonimas (sin correo y sin nombre util) en orden de llegada
  let lefts = 0, huerfanos = 0, ultimo = null;
  for (const e of orden) {
    if (e.clave == null) { // anonimo: una entrada = una persona; una salida descuenta al anonimo presente mas antiguo
      if (e.evento === "joined") {
        const p = { grupo: e.personal ? "personal" : "desconocidos", saldo: 1 };
        personas.set("a:" + e.id, p); anonimos.push(p);
      } else {
        lefts += 1;
        const p = anonimos.find((x) => x.saldo > 0);
        if (p) p.saldo -= 1; else huerfanos += 1;
      }
      if (ultimo == null || e.ms > ultimo) ultimo = e.ms;
      continue;
    }
    // con identidad, quien resuelve a una persona del roster se agrupa por persona (no por correo), como en Lista en vivo
    const hp = e.personal ? null : personaDeCorreo(rosterPorCorreo, e.correoHash);
    const clave = hp ? "p:" + hp : e.clave;
    let p = personas.get(clave);
    if (!p) {
      const grupo = e.personal ? "personal" : (grupoRoster(rosterPorCorreo, e.correoHash, slotId) ?? "desconocidos");
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
  const r = { roster: { maximo: 0, ahora: 0 }, otra: { maximo: 0, ahora: 0 }, desconocidos: { maximo: 0, ahora: 0 }, personal: { maximo: 0, ahora: 0 } };
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
// lecturaEventos=false => la memoria NO tiene los eventos del dia (instancia en frio fuera de horario): las terminadas sin eventos salen
// sin cifras y con AVISO_CIFRA_NO_DISPONIBLE (la pantalla oculta las burbujas); nunca se inventa un 0/0/0.
// rosterPorCorreo: identidad (indexarRosterVivo + conRegistro; lo que usa el servidor) o Map hash->Set(slot_id) (ver clasificarEventos). Contrato: roster_* cuenta SOLO el roster de la franja de la clase;
// otra_franja_* cuenta alumnos del roster de otra franja que entraron a esta sala (no se suman a roster ni a desconocidos).
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
    const c = clasificarEventos(evs, rosterPorCorreo, ahoraMs, f.slot_id);
    const sinCifra = estado === "terminada" && !evs.length && !lecturaEventos;
    const avisos = [];
    if (c.cobertura_baja_eventos) avisos.push(`Muchos 'salió' sin 'entró' previo (${Math.round(c.ratio_huerfanos * 100)} %): el webhook perdió entradas, puede subestimar a los presentes ahora; el máximo es la cifra firme.`);
    // (2026-10-10) Soporte ya es la cuenta admin con webhook completo: se quito el aviso fijo "pierde 45-60 %" y la marca de
    // cobertura baja por cuenta. La cobertura baja ahora solo sale de los datos (salidas sin entrada previa).
    if (sinCifra) avisos.push(AVISO_CIFRA_NO_DISPONIBLE);
    if (estado === "sin_sala") avisos.push("En ventana de clase, pero no se encontró la sala de Zoom.");
    clases.push({
      slot_id: f.slot_id, etiqueta: etiquetaClase(f), cuenta_zoom: f.cuenta_zoom,
      inicio: new Date(v.inicioMs).toISOString(), fin: new Date(v.finMs).toISOString(), estado, sala_activa: estado === "terminada" ? false : salaActiva,
      roster_total: Number(f.roster_n ?? 0), roster_maximo: c.roster.maximo, roster_ahora_aprox: c.roster.ahora,
      otra_franja_maximo: c.otra.maximo, otra_franja_ahora_aprox: c.otra.ahora,
      desconocidos_maximo: c.desconocidos.maximo, desconocidos_ahora_aprox: c.desconocidos.ahora,
      personal_maximo: c.personal.maximo, personal_ahora_aprox: c.personal.ahora,
      ultima_actividad: c.ultima_actividad_ms == null ? null : new Date(c.ultima_actividad_ms).toISOString(),
      eventos: c.eventos, cobertura_baja: c.cobertura_baja_eventos, aviso: avisos.length ? avisos.join(" ") : null,
    });
  }
  const general = [avisoGeneral, sinFranja ? `${sinFranja} sala(s) de clase sin franja asignable (no se cuentan).` : null].filter(Boolean);
  return { disponible: true, actualizado_en: new Date(Math.min(actualizadoMs ?? ahoraMs, ahoraMs)).toISOString(), semana, hora_servidor: new Date(ahoraMs).toISOString(),
    clases, aviso_general: general.length ? general.join(" ") : null };
}
