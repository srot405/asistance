// JC-ON en «En vivo» y «Lista en vivo» (TOC-208). Calculo PURO y sin imports (lo usa tambien el cliente en modo demo, por eso no
// importa vivoCalculo.mjs, que trae node:crypto).
//
// JC-ON es un programa APARTE de JC: 74 egresados en 2 grupos (jcon.estudiantes.horario: 'manana' = grupo V, clase del viernes
// 10:00-12:00; 'tarde' = grupo S, clase del sabado 14:00-16:00; hora Colombia, cuenta Zoom jovenescreativos). Requisito numero uno:
// JC-ON NUNCA se suma a cifras, franjas, roster ni caches de JC. Por eso:
//   - los temas JCON siguen fuera de JC (esClase de vivoCalculo.mjs solo acepta BACKEND / DESARROLLO WEB);
//   - JC-ON tiene sus propios lectores (lib/servidor/leerVivoJcon.ts y leerVivoNominalJcon.ts) con estado en memoria propio, y sus
//     propias franjas SINTETICAS (slot_id jcon-*), que no existen en asist_franjas;
//   - la sala se asocia a su franja por TEMA (grupoJcon), no por cuenta+hora: el sabado a las 14:00 la cuenta jovenescreativos
//     tambien puede tener una franja JC y no deben chocar;
//   - las rutas juntan las dos respuestas con combinarRespuestas: si una falla, la otra sale intacta con aviso.

export const PROGRAMA_JCON = "jcon";
export const COHORTE_JCON = "2026";
export const CUENTA_JCON = "jovenescreativos";
export const SLOT_JCON = Object.freeze({ V: "jcon-viernes-10", S: "jcon-sabado-14" });
// Grupo -> dia, desplazamiento desde el lunes y horas. Si cambia el horario de JC-ON, se cambia SOLO aqui.
export const GRUPOS_JCON = Object.freeze({
  V: Object.freeze({ slot_id: SLOT_JCON.V, dia: "viernes", desdeLunes: 4, hora_inicio: 10, hora_fin: 12, nombre: "Grupo V (viernes)" }),
  S: Object.freeze({ slot_id: SLOT_JCON.S, dia: "sábado", desdeLunes: 5, hora_inicio: 14, hora_fin: 16, nombre: "Grupo S (sábado)" }),
});
const GRUPO_DE_SLOT = new Map(Object.entries(GRUPOS_JCON).map(([g, d]) => [d.slot_id, g]));

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// "Sesión JCON1- Viernes 10:00 a.m. - 12  p.m." -> "sesionjcon1viernes1000am12pm"
export const normalizarTema = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9]/g, "");
const EXCLUIR = ["bienvenida", "entrevista", "equipo", "reunion"];

// Tema de Zoom -> "V" | "S" | null. null = no es clase JC-ON (incluye bienvenidas, entrevistas, reuniones de equipo y todo JC).
export function grupoJcon(tema) {
  const t = normalizarTema(tema);
  if (!t.includes("jcon")) return null;
  if (EXCLUIR.some((x) => t.includes(x))) return null;
  if (t.includes("jcon1")) return "V";
  if (t.includes("jcon2")) return "S";
  if (t.includes("viernes")) return "V";
  if (t.includes("sabado")) return "S";
  return null;
}
export const esClaseJcon = (tema) => grupoJcon(tema) != null;

// jcon.estudiantes.horario -> grupo. 'manana' = V (viernes), 'tarde' = S (sabado); ver scripts/jc-on-transicion/panel/cargar_asistencia_jcon.py.
export function grupoDeHorario(horario) {
  const t = normalizarTema(horario);
  if (t === "manana" || t === "v" || t === "viernes") return "V";
  if (t === "tarde" || t === "s" || t === "sabado") return "S";
  return null;
}
export const esActivoJcon = (estado) => String(estado ?? "").trim().toLowerCase() === "activo";

export function lunesDe(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const sumarDias = (fecha, n) => { const d = new Date(`${fecha}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Las 2 franjas SINTETICAS de la semana (mismo formato que asist_franjas). rosterN: { V, S } = activos de cada grupo.
export function franjasJcon(lunes, rosterN = {}) {
  return Object.entries(GRUPOS_JCON).map(([g, d]) => ({ slot_id: d.slot_id, dia: d.dia, fecha: sumarDias(lunes, d.desdeLunes), hora_inicio: d.hora_inicio,
    hora_fin: d.hora_fin, tipo: "JC-ON", cuenta_zoom: CUENTA_JCON, roster_n: Number(rosterN[g] ?? 0) }));
}
export const etiquetaJcon = (f) => { const g = GRUPO_DE_SLOT.get(f?.slot_id); return g ? `JC-ON · ${GRUPOS_JCON[g].nombre}` : `JC-ON · ${f?.slot_id ?? ""}`; };

// Sala -> slot_id por TEMA (nunca por cuenta+hora). Solo si esa franja esta entre las dadas (las de hoy): una sala JCON1 abierta el sabado
// no se cuenta en ninguna parte.
export function asociarSalaJcon(sala, franjas) {
  const g = grupoJcon(sala?.topic);
  if (!g) return null;
  const slot = GRUPOS_JCON[g].slot_id;
  return (franjas ?? []).some((f) => f.slot_id === slot) ? slot : null;
}

// Filas de jcon.estudiantes -> roster con el formato de asist_roster (persona_id = cedula; correo_norm = email normalizado; slot_id segun
// horario). Solo estado 'activo' (los retirados, si entran, salen como «sin identificar»). Sin cedula o sin horario reconocible: fuera.
export function rosterJcon(estudiantes) {
  const filas = [];
  const n = { V: 0, S: 0 };
  let descartados = 0;
  const vistos = new Set();
  for (const e of estudiantes ?? []) {
    if (!esActivoJcon(e.estado)) continue;
    const g = grupoDeHorario(e.horario);
    const cedula = String(e.cedula ?? "").replace(/\D/g, "");
    if (!g || !cedula) { descartados += 1; continue; }
    if (vistos.has(cedula)) continue;
    vistos.add(cedula);
    n[g] += 1;
    const nombre = [e.nombres, e.apellidos].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ") || null;
    filas.push({ persona_id: cedula, correo_norm: String(e.email ?? "").trim().toLowerCase() || null, nombre, ciudad: e.grupo_ciudad ?? null,
      slot_id: GRUPOS_JCON[g].slot_id });
  }
  return { filas, n, descartados };
}

const msIso = (iso) => { const v = Date.parse(iso ?? ""); return Number.isFinite(v) ? v : null; };

// Junta la respuesta de JC y la de JC-ON (En vivo o Lista en vivo: mismo esqueleto { disponible, actualizado_en, semana, hora_servidor,
// clases, aviso_general }). jc/jcon = null si su lector fallo. Reglas:
//   - JC sale SIEMPRE tal cual (mismas clases, mismo orden, mismas cifras); JC-ON se agrega al final.
//   - JC-ON solo cuenta si tiene clases hoy; un dia sin JC-ON no cambia nada de la respuesta de JC.
//   - Si JC no esta disponible (semana sin congelar, sin clases hoy) pero JC-ON tiene clases, se muestra JC-ON y el motivo de JC va como aviso.
//   - Si falla uno, el otro sale con aviso; si fallan los dos (o falla JC y JC-ON no tiene clase hoy) -> null (la ruta responde 503).
export const AVISO_FALLO_JCON = "JC-ON: no se pudo leer en este momento (las cifras de JC no se afectan).";
export const AVISO_FALLO_JC = "JC: no se pudo leer en este momento; abajo solo JC-ON.";
export function combinarRespuestas(jc, jcon, { falloJcon = false, falloJc = false } = {}) {
  const conJcon = Boolean(jcon && jcon.disponible && (jcon.clases ?? []).length);
  const avisoJcon = jcon?.aviso_general ? `JC-ON: ${jcon.aviso_general}` : null;
  if (!jc) {
    // JC fallo y JC-ON no tiene clase hoy: igual que antes de JC-ON (la ruta responde 503 y la pantalla reintenta).
    if (!conJcon) return null;
    return { ...jcon, aviso_general: [falloJc ? AVISO_FALLO_JC : null, avisoJcon].filter(Boolean).join(" ") || null };
  }
  if (!conJcon) {
    // Dia sin JC-ON (o JC-ON fallo): JC intacto. El aviso de fallo de JC-ON solo si fallo (no hay forma de saber si tenia clase).
    if (!falloJcon) return jc;
    return { ...jc, aviso_general: [jc.aviso_general, AVISO_FALLO_JCON].filter(Boolean).join(" ") };
  }
  const avisoJc = jc.aviso_general ? (jc.disponible ? jc.aviso_general : `JC: ${jc.aviso_general}`) : null;
  const tiempos = [jc.disponible ? msIso(jc.actualizado_en) : null, msIso(jcon.actualizado_en)].filter((x) => x != null);
  return { ...jc, disponible: true, semana: jc.semana ?? jcon.semana, actualizado_en: tiempos.length ? new Date(Math.min(...tiempos)).toISOString() : jcon.actualizado_en,
    clases: [...(jc.disponible ? jc.clases ?? [] : []), ...jcon.clases], aviso_general: [avisoJc, avisoJcon].filter(Boolean).join(" ") || null };
}
