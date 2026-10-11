// Cálculo puro del detalle por día/ciudad/franja de una semana nivel "Detalle"
// (roster congelado real). Sin I/O: recibe las filas ya leídas (de Supabase o
// del fixture demo) y devuelve agregados. Vive en .mjs -- no en .ts -- a
// propósito: así scripts/test-detalle-calculo.mjs lo puede importar y correr
// bajo Node sin depender de type-stripping (mismo patrón que lib/conteos.mjs,
// lib/exportar.mjs y lib/historico-demo.mjs).
//
// Espejo deliberado (simplificado) de backend/etl/historico_semanal.py::_detalle:
// mismas cuatro categorías del cuadre (medible/pendiente/sin_dato/sin_clase) y
// misma definición de "ingresó" (al menos una entrada identificada).

// Qué semanas son nivel "Detalle" ya no es una lista fija: lo decide
// asist_semana_resumen.nivel (ver semanaTieneDetalle en lib/servidor/leerDetalleSemana.ts).

import { mismaCiudad } from "./rolesCalculo.mjs";
const ESTADOS_MEDIBLES = new Set(["SI", "NO", "NO?"]);

export function construirBase(roster, franjasRaw, sesionesRaw, entradas, celdas) {
  const franjas = new Map(franjasRaw.map((f) => [f.slot_id, f]));
  const celdaPorPersona = new Map(celdas.map((c) => [c.persona_id, c.estado]));
  // Un slot "sin clase ocurrida" es uno cuya fecha no tuvo ninguna sesión con
  // entradas: mismo criterio que _cobertura() en el ETL.
  const fechasActivas = new Set(sesionesRaw.filter((s) => (s.entradas_totales ?? 0) > 0).map((s) => s.fecha));
  // TOC-131: una sesion marcada `sin_clase` (dia declarado sin clase en asist_dias_sin_clase) y sin
  // entradas es "sin clase confirmada": fuera del denominador, nunca ZL ni NO. Con entradas, no.
  const slotsDeclarados = new Set(sesionesRaw.filter((s) => s.estado_captura === "sin_clase" && !(s.entradas_totales > 0)).map((s) => s.slot_id));
  const slotsSinClase = new Set([...franjas.values()].filter((f) => !fechasActivas.has(f.fecha) || slotsDeclarados.has(f.slot_id)).map((f) => f.slot_id));
  const sesionPorId = new Map(sesionesRaw.map((s) => [s.sesion_id, s]));
  const entradaFechaPorPersona = new Map();
  // Botones del calendario (TOC-91): ademas de la FECHA, a que CLASE entro cada persona (persona x slot, sin repetir).
  const entradaSlotPorPersona = new Map();
  for (const entrada of entradas) {
    const sesion = sesionPorId.get(entrada.sesion_id);
    if (!sesion) continue;
    const fechas = entradaFechaPorPersona.get(entrada.persona_id) ?? new Set();
    fechas.add(sesion.fecha);
    entradaFechaPorPersona.set(entrada.persona_id, fechas);
    if (sesion.slot_id) {
      const slots = entradaSlotPorPersona.get(entrada.persona_id) ?? new Set();
      slots.add(sesion.slot_id);
      entradaSlotPorPersona.set(entrada.persona_id, slots);
    }
  }
  return { roster, franjas, fechasActivas, slotsSinClase, celdaPorPersona, entradaFechaPorPersona, entradaSlotPorPersona, sesiones: sesionesRaw };
}

// Exportada (TOC-91, pestaña Presencia): la clasificación medible/pendiente/
// sin_dato/sin_clase es la MISMA población que usa el resto del panel — quien
// necesite saber si una persona cuenta para un cálculo debe reusar esta
// función, nunca reimplementarla (ver lib/servidor/leerPresenciaClase.ts).
export function clasificar(persona, base) {
  if (!persona.slot_id || base.slotsSinClase.has(persona.slot_id)) return "sin_clase";
  const estado = base.celdaPorPersona.get(persona.persona_id);
  if (estado === "SC") return "sin_clase";
  if (estado && ESTADOS_MEDIBLES.has(estado)) return "medible";
  if (estado === "P") return "pendiente";
  return "sin_dato";
}

function aplicaFiltro(persona, base, filtro) {
  if (filtro.ciudad && !mismaCiudad(persona.ciudad, filtro.ciudad)) return false;
  if (filtro.franja && persona.slot_id !== filtro.franja) return false;
  if (filtro.cuenta) {
    const franja = persona.slot_id ? base.franjas.get(persona.slot_id) : undefined;
    if (!franja || franja.cuenta_zoom !== filtro.cuenta) return false;
  }
  return true;
}

function porcentaje(parte, total) {
  return total ? Math.round(((parte * 100) / total) * 100) / 100 : null;
}

// Exportadas (TOC-91): mismo criterio de "ingresó" que usa todo el panel.
export function entroEnFecha(base, personaId, fecha) {
  return Boolean(base.entradaFechaPorPersona.get(personaId)?.has(fecha));
}
export function entroEnSlot(base, personaId, slotId) {
  return Boolean(slotId && base.entradaSlotPorPersona?.get(personaId)?.has(slotId));
}
export function entroAlgunaVez(base, personaId) {
  return (base.entradaFechaPorPersona.get(personaId)?.size ?? 0) > 0;
}

// Personas medibles de un roster ya filtrado, sin restringir por fecha (alcance semanal).
function medibles(rosterFiltrado, base) {
  return rosterFiltrado.filter((p) => clasificar(p, base) === "medible");
}

// Ingresos a cada CLASE (la que recibe), persona x slot: propios (la clase esta entre las de la persona en el roster) y
// colados (no lo esta). Todas las entradas, medibles o no: es la cuenta de quien entro a esa sala. Filtros: ciudad = de la
// persona (mismaCiudad; quien no esta en el roster no tiene ciudad y solo cuenta sin filtro de ciudad); franja y cuenta = la
// clase que recibe (misma comparacion exacta que aplicaFiltro).
export function ingresosPorSlot(base, filtro = {}) {
  const personas = new Map();
  for (const r of base.roster) {
    const p = personas.get(r.persona_id) ?? { ciudad: r.ciudad, slots: new Set() };
    if (r.slot_id) p.slots.add(r.slot_id);
    personas.set(r.persona_id, p);
  }
  const salida = new Map();
  for (const [personaId, slots] of base.entradaSlotPorPersona ?? new Map()) {
    const p = personas.get(personaId);
    if (filtro.ciudad && !(p && mismaCiudad(p.ciudad, filtro.ciudad))) continue;
    for (const slotId of slots) {
      if (filtro.franja && slotId !== filtro.franja) continue;
      const franja = base.franjas.get(slotId);
      if (filtro.cuenta && (!franja || franja.cuenta_zoom !== filtro.cuenta)) continue;
      const c = salida.get(slotId) ?? { fecha: franja?.fecha ?? "", propios: 0, colados: 0 };
      if (p?.slots.has(slotId)) c.propios += 1; else c.colados += 1;
      salida.set(slotId, c);
    }
  }
  return salida;
}

// Campos de los botones del calendario sobre una poblacion medible ya armada (dia, clase o semana) y los ingresos de sus slots.
// en_su_horario: personas medibles que entraron a SU clase (siempre <= asistieron). colados: entraron a estas clases sin ser de
// ellas; su % es sobre TODOS los ingresos a esas clases (nunca sobre el roster: los colados no estan en el).
function camposIngreso(personas, base, ingresos) {
  const enSuHorario = personas.filter((p) => entroEnSlot(base, p.persona_id, p.slot_id)).length;
  const propios = ingresos.reduce((n, c) => n + c.propios, 0);
  const colados = ingresos.reduce((n, c) => n + c.colados, 0);
  return { en_su_horario: enSuHorario, porcentaje_su_horario: porcentaje(enSuHorario, personas.length),
    ingresos: propios + colados, colados, porcentaje_colados: porcentaje(colados, propios + colados) };
}

export function calcularResumen(rosterFiltrado, base) {
  const poblacion = medibles(rosterFiltrado, base);
  const asistieron = poblacion.filter((p) => entroAlgunaVez(base, p.persona_id)).length;
  return { poblacion: poblacion.length, asistieron, nunca: poblacion.length - asistieron,
    porcentaje_retencion: porcentaje(asistieron, poblacion.length),
    porcentaje_nunca: porcentaje(poblacion.length - asistieron, poblacion.length) };
}

export function calcularPorDia(rosterFiltrado, base) {
  const poblacion = medibles(rosterFiltrado, base);
  const porFecha = new Map();
  for (const persona of poblacion) {
    const franja = persona.slot_id ? base.franjas.get(persona.slot_id) : undefined;
    if (!franja) continue;
    const lista = porFecha.get(franja.fecha) ?? [];
    lista.push(persona);
    porFecha.set(franja.fecha, lista);
  }
  return [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, personas]) => {
    const asistieron = personas.filter((p) => entroEnFecha(base, p.persona_id, fecha)).length;
    return { fecha, poblacion: personas.length, asistieron, nunca: personas.length - asistieron,
      porcentaje_retencion: porcentaje(asistieron, personas.length),
      porcentaje_nunca: porcentaje(personas.length - asistieron, personas.length) };
  });
}

export function calcularPorClase(rosterFiltrado, base) {
  const poblacion = medibles(rosterFiltrado, base);
  const porSlot = new Map();
  for (const persona of poblacion) {
    if (!persona.slot_id) continue;
    const lista = porSlot.get(persona.slot_id) ?? [];
    lista.push(persona);
    porSlot.set(persona.slot_id, lista);
  }
  return [...porSlot.entries()].map(([slotId, personas]) => {
    const franja = base.franjas.get(slotId);
    const fecha = franja?.fecha ?? "";
    const asistieron = personas.filter((p) => entroEnFecha(base, p.persona_id, fecha)).length;
    return { fecha, slot_id: slotId, poblacion: personas.length, asistieron, nunca: personas.length - asistieron,
      porcentaje_retencion: porcentaje(asistieron, personas.length),
      porcentaje_nunca: porcentaje(personas.length - asistieron, personas.length) };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.slot_id ?? "").localeCompare(b.slot_id ?? ""));
}

// Agrega a resumen / porDia / porClase los campos de los botones del calendario (sin tocar las cifras oficiales).
function conIngresos(resultado, rosterFiltrado, base, filtro) {
  const porSlot = ingresosPorSlot(base, filtro);
  const todos = [...porSlot.values()];
  const poblacion = medibles(rosterFiltrado, base);
  const fechaDe = (p) => (p.slot_id ? base.franjas.get(p.slot_id)?.fecha : undefined);
  return {
    resumen: { ...resultado.resumen, ...camposIngreso(poblacion, base, todos) },
    porDia: resultado.porDia.map((d) => ({ ...d, ...camposIngreso(poblacion.filter((p) => fechaDe(p) === d.fecha), base,
      todos.filter((c) => c.fecha === d.fecha)) })),
    porClase: resultado.porClase.map((c) => ({ ...c, ...camposIngreso(poblacion.filter((p) => p.slot_id === c.slot_id), base,
      porSlot.has(c.slot_id) ? [porSlot.get(c.slot_id)] : []) })),
  };
}

export function calcularDetalleSemana(semana, base, filtro = {}) {
  const ciudades = [...new Set(base.roster.map((p) => p.ciudad).filter(Boolean))].sort();
  const franjas = [...base.franjas.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));
  const cuentas = [...new Set(franjas.map((f) => f.cuenta_zoom))].sort();
  const rosterFiltrado = base.roster.filter((p) => aplicaFiltro(p, base, filtro));
  return {
    semana, nivel: "Detalle", ciudades, franjas, cuentas, filtro,
    ...conIngresos({ resumen: calcularResumen(rosterFiltrado, base), porDia: calcularPorDia(rosterFiltrado, base),
      porClase: calcularPorClase(rosterFiltrado, base) }, rosterFiltrado, base, filtro),
  };
}

// Nominal (PII): el llamador es responsable de que solo salga por un CSV
// descargado detrás de exigirAcceso, nunca como JSON en pantalla.
export function listarAusentesDesdeBase(base, opts) {
  const rosterFiltrado = base.roster.filter((p) => aplicaFiltro(p, base, opts));
  const salida = [];
  for (const persona of rosterFiltrado) {
    if (clasificar(persona, base) !== "medible") continue;
    const franja = persona.slot_id ? base.franjas.get(persona.slot_id) : undefined;
    const fechaPersona = franja?.fecha ?? "";
    if (opts.fecha && fechaPersona !== opts.fecha) continue;
    const entro = opts.fecha ? entroEnFecha(base, persona.persona_id, opts.fecha) : entroAlgunaVez(base, persona.persona_id);
    if (!entro) salida.push({ nombre: persona.nombre, ciudad: persona.ciudad, slot_id: persona.slot_id ?? "", fecha: fechaPersona });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
