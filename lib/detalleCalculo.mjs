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
import { esSuHorario, hermanasPorSlot } from "./franjasHermanas.mjs";
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
export function entroAlgunaVez(base, personaId) {
  return (base.entradaFechaPorPersona.get(personaId)?.size ?? 0) > 0;
}

// Personas medibles de un roster ya filtrado, sin restringir por fecha (alcance semanal).
function medibles(rosterFiltrado, base) {
  return rosterFiltrado.filter((p) => clasificar(p, base) === "medible");
}

// Filtros del calendario (TOC-91, Samuel 2026-10-09). Todo se cuenta en el DIA Y LA CLASE DE LA PERSONA (su roster), no en
// la clase que recibe: si alguien del martes entra el miercoles, aparece el martes.
//  - horario: entro a SU clase.
//  - colados: NO entro a su clase pero si a otra de la semana ("solo colados").
//  - ambos:   horario + colados (= entro a alguna clase de la semana). Sin doble conteo: son grupos disjuntos.
// Denominador: el mismo roster medible del % oficial.
export function tipoIngreso(base, persona) {
  const slots = base.entradaSlotPorPersona?.get(persona.persona_id);
  // Franjas hermanas (2026-10-10): una sala del mismo dia/hora/tipo que la suya (grupos uno/dos fusionados) es su horario.
  base.hermanas ??= hermanasPorSlot([...base.franjas.values()]);
  if (persona.slot_id && slots && [...slots].some((s) => esSuHorario(new Set([persona.slot_id]), s, base.hermanas))) return "horario";
  // Fase 1.2 (plan veracidad 2026-10-09): una entrada a una sesion sin slot_id tambien es "entro a otra clase". Asi
  // horario+colados (= ambos) coincide EXACTO con entroAlgunaVez y "No ingresaron" es su complemento sin huecos.
  return entroAlgunaVez(base, persona.persona_id) ? "colados" : null;
}

// REGLA UNICA DE "ASISTIO" (fases 1.2/1.3 del plan de veracidad, 2026-10-09): asistio = "Horario correcto + colados" =
// entro a SU clase o a cualquier otra clase de la SEMANA, contado en el dia/clase DE SU ROSTER. La usan resumen, porDia,
// porClase (campo `asistieron`), el CSV "No ingresaron" (dia y semana, su complemento exacto) y Presencia ("Nunca entro").
// Invariante: asistieron (= ambos) + nunca (= filas del CSV No ingresaron) = poblacion medible, en cada dia/clase/semana.
export function asistioEnSemana(base, persona) {
  return tipoIngreso(base, persona) !== null;
}

function camposIngreso(personas, base) {
  let horario = 0, colados = 0;
  for (const p of personas) {
    const t = tipoIngreso(base, p);
    if (t === "horario") horario += 1; else if (t === "colados") colados += 1;
  }
  const n = personas.length;
  return { horario, colados, ambos: horario + colados,
    porcentaje_horario: porcentaje(horario, n), porcentaje_colados: porcentaje(colados, n), porcentaje_ambos: porcentaje(horario + colados, n) };
}

export function calcularResumen(rosterFiltrado, base) {
  const poblacion = medibles(rosterFiltrado, base);
  const asistieron = poblacion.filter((p) => asistioEnSemana(base, p)).length;
  return { poblacion: poblacion.length, asistieron, nunca: poblacion.length - asistieron,
    porcentaje_retencion: porcentaje(asistieron, poblacion.length),
    porcentaje_nunca: porcentaje(poblacion.length - asistieron, poblacion.length) };
}

// Fase 1.7 (semana abierta): una clase esta "en curso" -- su % aun no es final -- si (a) alguna de sus sesiones tiene
// asist_sesiones.estado_captura = "en_curso" (senal explicita del backend, la mas fiable: la pone el ETL mientras la sala
// esta abierta), o (b) su fecha ya tuvo clase (no es sin_clase) y su roster aun tiene personas en celda "P" (pendiente de
// cierre): mientras tanto solo quienes ya entraron son medibles y el % sale ~100 % artificial. Se mira el roster COMPLETO
// de la clase (no el filtrado): es un atributo de la clase, no del recorte.
export function slotsEnCurso(base) {
  const salida = new Set((base.sesiones ?? []).filter((s) => s.estado_captura === "en_curso" && s.slot_id).map((s) => s.slot_id));
  for (const persona of base.roster) {
    if (persona.slot_id && !salida.has(persona.slot_id) && clasificar(persona, base) === "pendiente") salida.add(persona.slot_id);
  }
  return salida;
}

// asistieron = asistioEnSemana (ver arriba). Antes (hasta 2026-10-09) porDia/porClase usaban entroEnFecha (entro a
// cualquier clase ESE dia): no cuadraba con el filtro "ambos" ni con el resumen semanal. Efecto en porcentaje_retencion
// por dia: SUBE en los dias entre semana (cuenta a quien se coló en otro dia), el sabado casi no cambia; queda igual a
// porcentaje_ambos. Medido con datos reales en semanas 2026-09-28 y 2026-10-05 (ver nota del plan).
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
    const asistieron = personas.filter((p) => asistioEnSemana(base, p)).length;
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
    const asistieron = personas.filter((p) => asistioEnSemana(base, p)).length;
    return { fecha, slot_id: slotId, poblacion: personas.length, asistieron, nunca: personas.length - asistieron,
      porcentaje_retencion: porcentaje(asistieron, personas.length),
      porcentaje_nunca: porcentaje(personas.length - asistieron, personas.length) };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.slot_id ?? "").localeCompare(b.slot_id ?? ""));
}

// Agrega a resumen / porDia / porClase los campos de los filtros del calendario (sin tocar las cifras oficiales).
// Tambien marca en_curso (fase 1.7) en clase, dia (alguna clase del recorte ese dia en curso) y semana.
function conIngresos(resultado, rosterFiltrado, base) {
  const poblacion = medibles(rosterFiltrado, base);
  const fechaDe = (p) => (p.slot_id ? base.franjas.get(p.slot_id)?.fecha : undefined);
  const enCurso = slotsEnCurso(base);
  const fechasEnCurso = new Set(rosterFiltrado.filter((p) => enCurso.has(p.slot_id)).map(fechaDe).filter(Boolean));
  return {
    resumen: { ...resultado.resumen, ...camposIngreso(poblacion, base), en_curso: fechasEnCurso.size > 0 },
    porDia: resultado.porDia.map((d) => ({ ...d, ...camposIngreso(poblacion.filter((p) => fechaDe(p) === d.fecha), base),
      en_curso: fechasEnCurso.has(d.fecha) })),
    porClase: resultado.porClase.map((c) => ({ ...c, ...camposIngreso(poblacion.filter((p) => p.slot_id === c.slot_id), base),
      en_curso: enCurso.has(c.slot_id) })),
  };
}

// Nominal (PII) de los filtros del calendario: solo sale en CSV autenticado. Una fila por persona medible del roster
// filtrado (y de ?fecha = dia de SU clase), con a que clases entro.
export function listarIngresosDesdeBase(base, opts) {
  const rosterFiltrado = base.roster.filter((p) => aplicaFiltro(p, base, opts));
  const salida = [];
  for (const persona of rosterFiltrado) {
    if (clasificar(persona, base) !== "medible") continue;
    const franja = persona.slot_id ? base.franjas.get(persona.slot_id) : undefined;
    if (opts.fecha && franja?.fecha !== opts.fecha) continue;
    const tipo = tipoIngreso(base, persona);
    if (!tipo || (opts.tipo !== "ambos" && opts.tipo !== tipo)) continue;
    const entro = [...(base.entradaSlotPorPersona.get(persona.persona_id) ?? [])]
      .map((s) => base.franjas.get(s)?.horario_texto ?? s).sort();
    salida.push({ tipo, nombre: persona.nombre, cedula: persona.persona_id, ciudad: persona.ciudad,
      su_clase: franja?.horario_texto ?? persona.slot_id ?? "", fecha: franja?.fecha ?? "",
      entro_a: entro.join(" / ") });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.su_clase.localeCompare(b.su_clase) || a.nombre.localeCompare(b.nombre));
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
      porClase: calcularPorClase(rosterFiltrado, base) }, rosterFiltrado, base),
  };
}

// Nominal (PII): el llamador es responsable de que solo salga por un CSV
// descargado detrás de exigirAcceso, nunca como JSON en pantalla.
// "No ingresaron" (fase 1.2): complemento EXACTO del filtro "Horario correcto + colados" -- medibles del roster (con
// ?fecha: los de ESE dia de clase) que no entraron a NINGUNA clase de la semana. Antes, con ?fecha, usaba entroEnFecha y
// listaba como ausentes a quienes se colaron en otro dia (25-29 personas por semana en datos reales).
export function listarAusentesDesdeBase(base, opts) {
  const rosterFiltrado = base.roster.filter((p) => aplicaFiltro(p, base, opts));
  const salida = [];
  for (const persona of rosterFiltrado) {
    if (clasificar(persona, base) !== "medible") continue;
    const franja = persona.slot_id ? base.franjas.get(persona.slot_id) : undefined;
    const fechaPersona = franja?.fecha ?? "";
    if (opts.fecha && fechaPersona !== opts.fecha) continue;
    if (!asistioEnSemana(base, persona)) salida.push({ nombre: persona.nombre, ciudad: persona.ciudad, slot_id: persona.slot_id ?? "", fecha: fechaPersona });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
