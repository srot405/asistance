// Calculo puro de la pestana "Lista en vivo" (TOC-153): quien esta en cada clase de HOY y con que senal. Sin I/O.
// A diferencia de vivoCalculo.mjs (solo conteos), este modulo SI trabaja con nombres, correos y cedulas: solo lo usa la ruta
// /api/vivo-nominal, que exige sesion y permiso nominal (autorizarNominal) antes de llamarlo.
//
// Identidad (en este orden; nunca se adivina por nombre ni por cercania):
//   1) correo del evento = correo del roster de la semana                -> "correo del roster"
//   2) registrant_id del evento (webhook, desde 2026-10-22) = registrante
//      de Zoom con cedula, y esa cedula = persona_id del roster           -> "registro de Zoom (ID)"
//   3) correo del evento = correo de un registrante de Zoom con cedula,
//      y esa cedula = persona_id del roster (con o sin ceros adelante)    -> "cédula del registro de Zoom"
//   4) nada de lo anterior                                               -> no identificado (con la cedula del registro si la hay;
//      primero la del registro por registrant_id, si no la del registro por correo)
// Senal: roster (de esta franja) | otra_franja (del roster de la semana, pero de otra franja) | no_identificado | personal
// (@tocaunavida.org o bots de notas tipo Fireflies/Otter).
import { asociarSalaAFranja, esNombreGenerico, esPersonal, estadoClase, etiquetaClase, normalizarCorreo, ventanaClase } from "./vivoCalculo.mjs";

export const SENALES = ["roster", "otra_franja", "no_identificado", "personal"];
export const COMO = { correo: "correo del roster", registro_id: "registro de Zoom (ID)", cedula: "cédula del registro de Zoom",
  registro: "registro de Zoom (cédula fuera del roster)",
  sin_registro: "correo sin registro ni roster", sin_correo: "sin correo (solo nombre de Zoom)", anonimo: "sin correo ni nombre útil", personal: "personal" };

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const espacios = (t) => String(t ?? "").trim().replace(/\s+/g, " ");
const nombreClave = (n) => espacios(sinAcentos(n)).toLowerCase();
export const cedulaSinCeros = (c) => String(c ?? "").replace(/\D/g, "").replace(/^0+/, "");

export { esPersonal };   // regla unica en vivoCalculo.mjs (dominio @tocaunavida.org o robot de notas)

// roster: [{ persona_id, correo_norm, nombre, ciudad, slot_id }] (una fila por persona y franja)
export function indexarRoster(roster) {
  const porId = new Map();
  for (const f of roster) {
    const id = String(f.persona_id ?? "");
    if (!id) continue;
    let p = porId.get(id);
    if (!p) { p = { persona_id: id, nombre: f.nombre ?? null, ciudad: f.ciudad ?? null, correos: new Set(), slots: new Set() }; porId.set(id, p); }
    if (f.correo_norm) p.correos.add(normalizarCorreo(f.correo_norm));
    if (f.slot_id) p.slots.add(f.slot_id);
    if (!p.nombre && f.nombre) p.nombre = f.nombre;
    if (!p.ciudad && f.ciudad) p.ciudad = f.ciudad;
  }
  const porCorreo = new Map(), porCedula = new Map();
  for (const p of porId.values()) {
    for (const c of p.correos) porCorreo.set(c, p);
    const k = cedulaSinCeros(p.persona_id);
    if (k) porCedula.set(k, p);
  }
  return { porCorreo, porCedula };
}

// registrantes: [{ correo_norm, cedula_digitos, nombre, apellido }] -> Map correo -> registrante (el ultimo con cedula gana)
export function indexarRegistrantes(registrantes) {
  const m = new Map();
  for (const r of registrantes ?? []) {
    const c = normalizarCorreo(r.correo_norm);
    if (!c) continue;
    if (!m.has(c) || r.cedula_digitos) m.set(c, r);
  }
  return m;
}

// registrantes por registrant_id: [{ registrant_id, correo_norm, cedula_digitos, nombre, apellido }] -> Map registrant_id -> registrante.
// El lector los busca por los registrant_id vistos en los eventos del dia, SIN filtrar por fecha_sesion (el sync la reescribe).
export function indexarRegistrantesPorId(registrantes) {
  const m = new Map();
  for (const r of registrantes ?? []) {
    const id = String(r.registrant_id ?? "").trim();
    if (!id) continue;
    if (!m.has(id) || r.cedula_digitos) m.set(id, r);
  }
  return m;
}

// Una identidad por evento: { clave, base, persona|null, como, registrante|null, personal }. base = la clave sin persona (correo o
// registro): personasDeClase la usa para que un evento sin registrant_id caiga en la persona ya resuelta con el mismo correo.
export function identificar(evento, idxRoster, idxReg, idxRegId = new Map()) {
  const correo = normalizarCorreo(evento.correo);
  const nombre = nombreClave(evento.nombre);
  // Personal: correo + nombre visible (el correo institucional lo comparten el host y los monitores; ver compactarEvento).
  if (esPersonal(correo, evento.nombre)) { const c = correo ? (nombre ? `c:${correo}|${nombre}` : `c:${correo}`) : nombre ? `n:${nombre}` : `a:${evento.id}`;
    return { clave: c, base: c, persona: null, como: "personal", registrante: null, personal: true }; }
  const rid = String(evento.registrant_id ?? "").trim();
  const base = correo ? `c:${correo}` : rid ? `r:${rid}` : !esNombreGenerico(nombre) ? `n:${nombre}` : null;
  const p = correo ? idxRoster.porCorreo.get(correo) : null;
  if (p) return { clave: `p:${p.persona_id}`, base, persona: p, como: "correo", registrante: null, personal: false };
  const rId = rid ? idxRegId.get(rid) ?? null : null;
  const kId = cedulaSinCeros(rId?.cedula_digitos);
  const pId = kId ? idxRoster.porCedula.get(kId) : null;
  if (pId) return { clave: `p:${pId.persona_id}`, base, persona: pId, como: "registro_id", registrante: rId, personal: false };
  const rC = correo ? idxReg.get(correo) ?? null : null;
  const k = cedulaSinCeros(rC?.cedula_digitos);
  const p2 = k ? idxRoster.porCedula.get(k) : null;
  if (p2) return { clave: `p:${p2.persona_id}`, base, persona: p2, como: "cedula", registrante: rC, personal: false };
  // no identificado: se muestra el registro que tenga cedula (primero el del registrant_id), si no cualquiera de los dos
  const r = (rId?.cedula_digitos ? rId : null) ?? (rC?.cedula_digitos ? rC : null) ?? rId ?? rC;
  if (correo) return { clave: base, base, persona: null, como: r ? "registro" : "sin_registro", registrante: r, personal: false };
  if (rid) return { clave: base, base, persona: null, como: r ? "registro" : !esNombreGenerico(nombre) ? "sin_correo" : "anonimo", registrante: r, personal: false };
  if (base) return { clave: base, base, persona: null, como: "sin_correo", registrante: null, personal: false };
  return { clave: null, base: null, persona: null, como: "anonimo", registrante: null, personal: false };
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

// eventos crudos de UNA clase -> personas. etiquetaSlot: slot_id -> texto de la clase.
export function personasDeClase(eventos, slotId, idxRoster, idxReg, etiquetaSlot, ahoraMs, idxRegId = new Map()) {
  const orden = eventos.filter((e) => ahoraMs == null || e.ms <= ahoraMs).sort((a, b) => a.ms - b.ms || a.id - b.id);
  const personas = new Map();
  const anonimos = [];
  const alias = new Map(); // base (correo/registro) -> clave de persona ya resuelta (p. ej. el 'salio' sin registrant_id); igual en vivoCalculo
  for (const e of orden) {
    const id = identificar(e, idxRoster, idxReg, idxRegId);
    if (id.persona && id.base) alias.set(id.base, id.clave);
    else if (!id.personal && id.base && alias.has(id.base)) id.clave = alias.get(id.base);
    let p;
    if (id.clave == null) {
      if (e.evento !== "joined") { const a = anonimos.find((x) => x.saldo > 0); if (a) { a.saldo -= 1; a.ultima_salida = e.ms; } continue; }
      p = null;
    } else p = personas.get(id.clave);
    if (!p) {
      const pers = id.persona;
      const senal = id.personal ? "personal" : pers ? (pers.slots.has(slotId) ? "roster" : "otra_franja") : "no_identificado";
      const reg = id.registrante;
      const nombreReg = reg ? espacios(`${reg.nombre ?? ""} ${reg.apellido ?? ""}`) : "";
      p = { senal, como: COMO[id.como], nombre: pers?.nombre ?? (nombreReg || espacios(e.nombre) || null),
        cedula: pers?.persona_id ?? (reg?.cedula_digitos || null), ciudad: pers?.ciudad ?? null, correo: normalizarCorreo(e.correo) || null,
        su_clase: pers && senal === "otra_franja" ? [...pers.slots].map((s) => etiquetaSlot(s)).join(" / ") : null,
        primera_entrada_ms: null, ultima_salida_ms: null, entradas: 0, saldo: 0 };
      if (id.clave == null) { personas.set(`a:${e.id}`, p); anonimos.push(p); } else personas.set(id.clave, p);
    }
    if (e.evento === "joined") {
      p.entradas += 1; p.saldo += 1;
      if (p.primera_entrada_ms == null) p.primera_entrada_ms = e.ms;
    } else { if (p.saldo > 0) p.saldo -= 1; p.ultima_salida_ms = e.ms; }
  }
  const ordenSenal = (s) => SENALES.indexOf(s);
  return [...personas.values()].filter((p) => p.entradas > 0)
    .map(({ saldo, primera_entrada_ms, ultima_salida_ms, ...p }) => ({ ...p, en_sala: saldo > 0, primera_entrada: iso(primera_entrada_ms), ultima_salida: iso(ultima_salida_ms) }))
    .sort((a, b) => ordenSenal(a.senal) - ordenSenal(b.senal) || String(a.primera_entrada).localeCompare(String(b.primera_entrada)) || String(a.nombre).localeCompare(String(b.nombre)));
}

const cifrasVacias = () => Object.fromEntries(SENALES.map((s) => [s, { total: 0, en_sala: 0 }]));

// franjasHoy: franjas del dia; franjasSemana: todas las de la semana (para nombrar "su clase"); salas: [{ uuid, host, topic, activo,
// eventos: [{ id, evento, ms, correo, nombre }] }] ya filtradas por esClase.
export function armarListaVivo({ semana, franjasHoy, franjasSemana, salas, roster, registrantes, registrantesPorId = [], ahoraMs, actualizadoMs, avisoGeneral = null }) {
  const idxRoster = indexarRoster(roster);
  const idxReg = indexarRegistrantes(registrantes);
  const idxRegId = indexarRegistrantesPorId(registrantesPorId);
  const etiquetas = new Map((franjasSemana ?? franjasHoy).map((f) => [f.slot_id, etiquetaClase(f)]));
  const etiquetaSlot = (s) => etiquetas.get(s) ?? s;
  const porSlot = new Map();
  let sinFranja = 0;
  for (const s of salas) {
    const ms = s.eventos.length ? Math.min(...s.eventos.map((e) => e.ms)) : ahoraMs;
    const slot = asociarSalaAFranja({ host: s.host, topic: s.topic, primerMs: ms }, franjasHoy);
    if (!slot) { if (s.eventos.length) sinFranja += 1; continue; }
    if (!porSlot.has(slot)) porSlot.set(slot, []);
    porSlot.get(slot).push(s);
  }
  const clases = [];
  const ordenadas = [...franjasHoy].sort((a, b) => a.hora_inicio - b.hora_inicio || a.slot_id.localeCompare(b.slot_id));
  for (const f of ordenadas) {
    const v = ventanaClase(f);
    const sl = porSlot.get(f.slot_id) ?? [];
    const evs = sl.flatMap((s) => s.eventos);
    const enVentana = evs.filter((e) => e.ms >= v.desdeMs && e.ms <= v.hastaMs).length;
    const estado = estadoClase(f, ahoraMs, { salaActiva: sl.some((s) => s.activo), eventosEnVentana: enVentana });
    if (!estado) continue;
    const personas = personasDeClase(evs, f.slot_id, idxRoster, idxReg, etiquetaSlot, ahoraMs, idxRegId);
    const cifras = cifrasVacias();
    for (const p of personas) { cifras[p.senal].total += 1; if (p.en_sala) cifras[p.senal].en_sala += 1; }
    clases.push({ slot_id: f.slot_id, etiqueta: etiquetaClase(f), cuenta_zoom: f.cuenta_zoom, estado, inicio: iso(v.inicioMs), fin: iso(v.finMs),
      roster_total: Number(f.roster_n ?? 0), cifras, personas });
  }
  const avisos = [avisoGeneral, sinFranja ? `${sinFranja} sala(s) de clase sin franja asignable (sus personas no aparecen).` : null].filter(Boolean);
  return { disponible: true, semana, hora_servidor: iso(ahoraMs), actualizado_en: iso(Math.min(actualizadoMs ?? ahoraMs, ahoraMs)), clases,
    aviso_general: avisos.length ? avisos.join(" ") : null };
}

// Recorte por permiso, en el servidor. nominal "todo": todo. Monitor (ciudad): solo personas del roster de SU ciudad
// (roster u otra_franja); no identificados y personal solo los ve "todo". Las cifras por clase son agregados: no se recortan.
export function recortarPorPermiso(respuesta, permiso, mismaCiudad) {
  if (!permiso.ciudad) return respuesta;
  return { ...respuesta, clases: respuesta.clases.map((c) => ({ ...c,
    personas: c.personas.filter((p) => (p.senal === "roster" || p.senal === "otra_franja") && mismaCiudad(p.ciudad, permiso.ciudad)) })) };
}

export const ETIQUETA_SENAL = { roster: "De esta clase", otra_franja: "Colados (otra clase)", no_identificado: "No identificado", personal: "Personal" };

export function filasCsv(respuesta) {
  const filas = [["clase", "senal", "nombre", "cedula", "ciudad", "correo", "su_clase", "primera_entrada", "ultima_salida", "entradas", "en_sala", "como_se_identifico"]];
  for (const c of respuesta.clases) for (const p of c.personas)
    filas.push([c.etiqueta, ETIQUETA_SENAL[p.senal], p.nombre ?? "", p.cedula ?? "", p.ciudad ?? "", p.correo ?? "", p.su_clase ?? "",
      p.primera_entrada ?? "", p.ultima_salida ?? "", p.entradas, p.en_sala ? "SI" : "NO", p.como]);
  return filas;
}
