// Cobertura de captura por clase: roster semanal (asist_franjas) contra lo que
// el webhook de Zoom realmente registró (zoom_live_log, evento joined).
// Pura y sin I/O (mismo patrón que lib/horarioFranja.mjs) para correrla bajo Node en
// scripts/test-cobertura.mjs.
//
// zoom_live_log no trae slot_id ni cuenta: cada reunión (uuid) se atribuye a la franja
// compatible más cercana a su primera entrada. Compatible = mismo nivel (Avanzado o no)
// y, en franjas "uno"/"dos", la sala que dice el nombre del curso. Una franja sin
// sesión aún prefiere ganar la sesión, para no dejar dos salas simultáneas sobre una sola.

const MIN = 60 * 1000;
const ANTES_MS = 45 * MIN; // alguien abre la sala antes de la hora
const DESPUES_MS = 30 * MIN; // margen tras la hora de fin
const PENALIZA_OCUPADA_MS = 10 * 60 * MIN;
const DOMINIO_STAFF = "@tocaunavida.org";
const COT_OFFSET_MS = 5 * 60 * MIN;

const inicioFranjaMs = (f) => Date.parse(`${f.fecha}T00:00:00Z`) + f.hora_inicio * 60 * MIN + COT_OFFSET_MS;
const finFranjaMs = (f) =>
  Date.parse(`${f.fecha}T00:00:00Z`) + (f.hora_fin ?? f.hora_inicio + 2) * 60 * MIN + COT_OFFSET_MS;

function compatible(franja, curso) {
  const esAvanzado = /avanzado/i.test(curso);
  if ((franja.tipo === "Avanzado") !== esAvanzado) return false;
  if (/-uno$/.test(franja.slot_id) && /sala\s*2/i.test(curso)) return false;
  if (/-dos$/.test(franja.slot_id) && /sala\s*1/i.test(curso)) return false;
  return true;
}

function clavePersona(e) {
  const correo = (e.correo ?? "").trim().toLowerCase();
  if (correo) return correo.endsWith(DOMINIO_STAFF) ? null : correo;
  const nombre = (e.nombre ?? "").trim().toLowerCase();
  return nombre || null;
}

// franjas: [{slot_id, fecha, tipo, cuenta_zoom, horario_texto, hora_inicio, hora_fin, roster_n, captura_automatica}]
// eventos: [{uuid, curso, correo, nombre, hora_ms}] (joined y left). Cuenta a quien tenga CUALQUIER
// evento: el webhook pierde entradas (el 30-sep hubo 31 joined contra 66 left), pero la salida de
// alguien prueba que estuvo. ahoraMs: reloj inyectable.
export function calcularCobertura(franjas, eventos, ahoraMs) {
  const sesiones = new Map();
  for (const e of eventos) {
    const s = sesiones.get(e.uuid) ?? { uuid: e.uuid, curso: e.curso ?? "", primeraMs: e.hora_ms, personas: new Set() };
    s.primeraMs = Math.min(s.primeraMs, e.hora_ms);
    const clave = clavePersona(e);
    if (clave) s.personas.add(clave);
    sesiones.set(e.uuid, s);
  }
  const porFranja = new Map(franjas.map((f) => [f.slot_id, []]));
  let sinClase = 0;
  const ordenadas = [...sesiones.values()].sort((a, b) => b.personas.size - a.personas.size);
  for (const s of ordenadas) {
    let mejor = null;
    for (const f of franjas) {
      const ini = inicioFranjaMs(f);
      if (s.primeraMs < ini - ANTES_MS || s.primeraMs > finFranjaMs(f) + DESPUES_MS) continue;
      if (!compatible(f, s.curso)) continue;
      const costo = Math.abs(s.primeraMs - ini) + (porFranja.get(f.slot_id).length ? PENALIZA_OCUPADA_MS : 0);
      if (!mejor || costo < mejor.costo) mejor = { f, costo };
    }
    if (mejor) porFranja.get(mejor.f.slot_id).push(s);
    else sinClase += 1;
  }
  const inicioDe = new Map(franjas.map((f) => [f.slot_id, inicioFranjaMs(f)]));
  const clases = franjas
    .map((f) => {
      const ses = porFranja.get(f.slot_id);
      const ini = inicioDe.get(f.slot_id);
      const fin = finFranjaMs(f);
      let estado;
      if (ses.length > 0) estado = ahoraMs < fin + 15 * MIN ? "en_curso" : "capturada";
      else if (ahoraMs < ini) estado = "pendiente";
      else if (ahoraMs <= fin + DESPUES_MS) estado = "sin_entradas_aun";
      else estado = "sin_captura";
      return {
        slot_id: f.slot_id, fecha: f.fecha, horario_texto: f.horario_texto, tipo: f.tipo,
        cuenta_zoom: f.cuenta_zoom, roster_n: f.roster_n, captura_automatica: f.captura_automatica,
        estado, personas: new Set(ses.flatMap((s) => [...s.personas])).size, sesiones: ses.length,
      };
    })
    .sort((a, b) => inicioDe.get(a.slot_id) - inicioDe.get(b.slot_id) || a.slot_id.localeCompare(b.slot_id));
  return {
    clases,
    resumen: {
      programadas: clases.length,
      dictadas: clases.filter((c) => c.estado !== "pendiente").length,
      capturadas: clases.filter((c) => c.estado === "capturada" || c.estado === "en_curso").length,
      faltan: clases.filter((c) => c.estado === "sin_captura").length,
      pendientes: clases.filter((c) => c.estado === "pendiente").length,
    },
    sesiones_sin_clase: sinClase,
  };
}
