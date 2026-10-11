// Poblacion del periodo (TOC-91, auditoria de veracidad 2026-10-09). Sin I/O. Reemplaza el `nunca_periodo` que guardaba el ETL
// (solo un numero, calculado con su propia identificacion por correo/nombre y sin lista) por un calculo rastreable 1 a 1 desde
// las mismas tablas del panel, identificando por CEDULA (persona_id). Todo lo que devuelve como lista es PII: solo sale en CSV.
//
// Poblacion = roster de la ULTIMA semana congelada del periodo (los retirados ya no estan en el roster).
//  - nunca: sin ninguna fila en asist_entradas del periodo NI evidencia de clase en el log crudo de Zoom (solo_log).
//  - solo_log: tiene entrada a una CLASE en zoom_live_log (por correo o por la cedula del registro de Zoom) pero el ETL no la
//    registro en asist_entradas. No cuenta como "nunca"; es un hueco del pipeline para revisar.
//  - sin_rastro: no aparece en zoom_registrantes ni por correo (de cualquier semana) ni por cedula (con o sin ceros).
//  - solo_colados: entro al menos una vez, pero nunca a SU clase de esa semana (ni en ninguna semana del periodo).
import { mismaCiudad } from "./rolesCalculo.mjs";
import { esSuHorario, hermanasPorSlot } from "./franjasHermanas.mjs";

export const sinCeros = (c) => String(c ?? "").replace(/\D/g, "").replace(/^0+/, "");
const corr = (c) => String(c ?? "").trim().toLowerCase();

// rosterPeriodo: [{ semana, persona_id, nombre, ciudad, correo_norm, slot_id }] de todas las semanas del periodo
// ultimaSemana: lunes de la ultima semana congelada; franjas: [{ semana, slot_id, horario_texto }]
// entradas: [{ semana, persona_id, sesion_id }]; sesiones: [{ sesion_id, slot_id, semana }]
// registrantes: [{ correo_norm, cedula_digitos }]; soloLog: Set(persona_id) calculado por el lector; celdas: Map(persona_id -> estado)
export function armarPoblacion({ rosterPeriodo, ultimaSemana, franjas, entradas, sesiones, registrantes, soloLog = new Set(), celdas = new Map() }) {
  const horario = new Map(franjas.map((f) => [`${f.semana}|${f.slot_id}`, f.horario_texto ?? f.slot_id]));
  const hermanas = hermanasPorSlot(franjas, true);
  const slotSesion = new Map(sesiones.map((s) => [s.sesion_id, s]));
  const personas = new Map();      // persona_id -> datos de la ultima semana
  const correos = new Map();       // persona_id -> Set(correo) de todo el periodo
  const slotsPorSemana = new Map(); // `${semana}|${persona}` -> Set(slot)
  for (const r of rosterPeriodo) {
    const id = String(r.persona_id);
    if (r.correo_norm) { if (!correos.has(id)) correos.set(id, new Set()); correos.get(id).add(corr(r.correo_norm)); }
    const k = `${r.semana}|${id}`;
    if (!slotsPorSemana.has(k)) slotsPorSemana.set(k, new Set());
    if (r.slot_id) slotsPorSemana.get(k).add(r.slot_id);
    if (r.semana === ultimaSemana) {
      const p = personas.get(id) ?? { cedula: id, nombre: r.nombre, ciudad: r.ciudad, correo: corr(r.correo_norm), slots: [] };
      if (r.slot_id) p.slots.push(horario.get(`${r.semana}|${r.slot_id}`) ?? r.slot_id);
      personas.set(id, p);
    }
  }
  const regCorreo = new Set(registrantes.map((r) => corr(r.correo_norm)).filter(Boolean));
  const regCedula = new Set(registrantes.map((r) => sinCeros(r.cedula_digitos)).filter(Boolean));
  const entro = new Map(); // persona -> { propia: bool, clases: Set(texto), semanas: Set }
  for (const e of entradas) {
    const s = slotSesion.get(e.sesion_id);
    if (!s) continue;
    const id = String(e.persona_id);
    const x = entro.get(id) ?? { propia: false, clases: new Set(), semanas: new Set() };
    const propias = slotsPorSemana.get(`${s.semana}|${id}`);
    if (propias && esSuHorario(new Set([...propias].map((p) => `${s.semana}|${p}`)), `${s.semana}|${s.slot_id}`, hermanas)) x.propia = true;
    x.clases.add(horario.get(`${s.semana}|${s.slot_id}`) ?? s.slot_id);
    x.semanas.add(s.semana);
    entro.set(id, x);
  }
  const listas = { nunca: [], sin_rastro: [], solo_colados: [], solo_log: [] };
  for (const [id, p] of personas) {
    const registrado = regCedula.has(sinCeros(id)) || [...(correos.get(id) ?? [])].some((c) => regCorreo.has(c));
    const base = { cedula: id, nombre: p.nombre, ciudad: p.ciudad, correo: p.correo, su_clase: p.slots.join(" / "),
      estado_semana: celdas.get(id) ?? "", registrado_zoom: registrado ? "SI" : "NO" };
    const e = entro.get(id);
    if (!e && soloLog.has(id)) listas.solo_log.push({ ...base, motivo: "Entró a clase según el log crudo de Zoom, pero el panel no lo registró" });
    else if (!e) listas.nunca.push({ ...base, motivo: registrado ? "Ausente con registro en Zoom" : "Sin rastro: no está en el registro de Zoom" });
    if (!registrado) listas.sin_rastro.push({ ...base, ingreso_periodo: e || soloLog.has(id) ? "SI" : "NO" });
    if (e && !e.propia) listas.solo_colados.push({ ...base, clases_a_las_que_entro: [...e.clases].sort().join(" / "), semanas: [...e.semanas].sort().join(" / ") });
  }
  for (const l of Object.values(listas)) l.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return {
    poblacion: personas.size,
    conteos: { nunca: listas.nunca.length, nunca_con_registro: listas.nunca.filter((x) => x.registrado_zoom === "SI").length,
      nunca_sin_registro: listas.nunca.filter((x) => x.registrado_zoom === "NO").length,
      sin_rastro: listas.sin_rastro.length, solo_colados: listas.solo_colados.length, solo_log: listas.solo_log.length },
    listas,
  };
}

// Candidatos para buscar en el log crudo: quienes no tienen entradas. Devuelve Map(correo -> persona_id) con sus correos del
// periodo y los correos del registro de Zoom que comparten su cedula (asi se encuentran aunque entren con otro correo).
export function correosABuscar({ rosterPeriodo, ultimaSemana, entradas, registrantes }) {
  const conEntrada = new Set(entradas.map((e) => String(e.persona_id)));
  const candidatos = new Set(rosterPeriodo.filter((r) => r.semana === ultimaSemana && !conEntrada.has(String(r.persona_id))).map((r) => String(r.persona_id)));
  const mapa = new Map();
  for (const r of rosterPeriodo) if (candidatos.has(String(r.persona_id)) && r.correo_norm) mapa.set(corr(r.correo_norm), String(r.persona_id));
  const porCedula = new Map([...candidatos].map((id) => [sinCeros(id), id]));
  for (const g of registrantes) { const id = porCedula.get(sinCeros(g.cedula_digitos)); if (id && g.correo_norm) mapa.set(corr(g.correo_norm), id); }
  return mapa;
}

export const VISTAS_POBLACION = ["nunca", "sin_rastro", "solo_colados", "solo_log"];
export const COLUMNAS_POBLACION = {
  nunca: ["cedula", "nombre", "correo", "ciudad", "su_clase", "estado_semana", "registrado_zoom", "motivo"],
  sin_rastro: ["cedula", "nombre", "correo", "ciudad", "su_clase", "estado_semana", "ingreso_periodo"],
  solo_colados: ["cedula", "nombre", "correo", "ciudad", "su_clase", "clases_a_las_que_entro", "semanas"],
  solo_log: ["cedula", "nombre", "correo", "ciudad", "su_clase", "estado_semana", "motivo"],
  no_medibles: ["cedula", "nombre", "correo", "ciudad", "su_clase", "motivo"],
};

export const filtrarCiudad = (filas, ciudad) => (ciudad ? filas.filter((f) => mismaCiudad(f.ciudad, ciudad)) : filas);
