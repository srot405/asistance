import type { CorteResumen, CorteVisual, DemoData, ParticipanteSemana, ParticipanteVisual, Slot } from "./types";

type Fila = Record<string, any>;
const SIN_DATO = new Set(["zoom_limit_pendiente", "sin_captura", "dudosa"]);
const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
const PROPIA = new Set(["V", "SI"]);
const OTRA = new Set(["A", "N"]);

function nombreBreve(persona: Fila): string {
  const nombre = String(persona.nombre ?? "").trim().split(/\s+/).filter(Boolean);
  const apellidoSeparado = String(persona.apellido ?? persona.apellidos ?? "").trim().split(/\s+/).filter(Boolean)[0];
  if (!nombre.length) return "";
  if (apellidoSeparado) return `${nombre[0]} ${apellidoSeparado}`;
  if (nombre.length === 1) return nombre[0];
  return `${nombre[0]} ${nombre.length >= 3 ? nombre[nombre.length - 2] : nombre[1]}`;
}

export function crearCorteVisual(
  participantes: ParticipanteSemana[],
  franjas: Slot[],
  filtro: { fecha?: string; franja?: string } = {},
): CorteVisual {
  const slots = franjas.filter((slot) =>
    (!filtro.fecha || slot.fecha === filtro.fecha) &&
    (!filtro.franja || slot.slot_id === filtro.franja),
  );
  const slotsIds = new Set(slots.map((slot) => slot.slot_id));
  const visuales: ParticipanteVisual[] = [];
  for (const participante of participantes) {
    const propias = participante.franjas.filter((slot) => slotsIds.has(slot)).sort();
    if (!propias.length) continue;
    const estados = propias.map((slot) => participante.estado_por_franja[slot] ?? "-");
    const estado_visual = estados.some((estado) => PROPIA.has(estado))
      ? "propia"
      : estados.some((estado) => OTRA.has(estado))
        ? "otra"
        : "sin_ingreso";
    visuales.push({ ...participante, estado_visual,
      por_revisar: estados.some((estado) => estado === "R?") ||
        (!filtro.fecha && !filtro.franja && participante.estado_semana === "NO?"),
      franja_visual: propias[0],
    });
  }
  const agrupar = (personas: ParticipanteVisual[]) => slots
    .map((slot) => ({ slot_id: slot.slot_id,
      participantes: personas.filter((persona) => persona.franja_visual === slot.slot_id),
    }))
    .filter((grupo) => grupo.participantes.length > 0);
  const faltantes = visuales.filter((persona) => persona.estado_visual === "sin_ingreso");
  const rescataron = visuales.filter((persona) => persona.estado_visual === "otra").length;
  return { participantes: visuales, grupos: agrupar(visuales), faltantes,
    grupos_faltantes: agrupar(faltantes), noIngresaron: rescataron + faltantes.length,
    rescataron, sinIngresarHastaHoy: faltantes.length };
}

// `fueraDato` (ZL: no pudimos medir) y `pendiente` (P: la clase no ha ocurrido)
// son dos razones distintas para no ser medible, y ninguna es una ausencia.
// Sin restar `pendiente`, la semana en curso daba medible=726 y falto=726: el
// panel afirmaba que 726 personas faltaron a clases que no han pasado.
function crearCorte(etiqueta: string, roster: number, fueraDato: number, pendiente: number, entro: number, aOtra: number, si: number): CorteResumen {
  const medible = Math.max(roster - fueraDato - pendiente, 0);
  return { etiqueta, roster, medible, fueraDato, pendiente, entro, aOtra, si, falto: Math.max(medible - si, 0), asistenciaPct: pct(si, medible) };
}

export function agregarDatos(raw: {
  semana: string;
  materia?: string;
  estado_semana?: string;
  roster: Fila[];
  franjas: Fila[];
  entradas?: Fila[];
  celdas_dia: Fila[];
  celdas_semana: Fila[];
  no_identificados: Fila[];
  semana_registrada?: boolean;
}, options: { incluirNombres?: boolean } = {}): DemoData {
  const personaDe = new Map(raw.roster.map((p) => [p.persona_id, p]));
  const semanal = new Map(raw.celdas_semana.map((c) => [c.persona_id, c.estado]));
  const slots: Slot[] = raw.franjas.map((f) => ({
    slot_id: f.slot_id, fecha: f.fecha, cuenta_zoom: f.cuenta_zoom,
    roster_n: f.roster_n ?? 0, estado_captura: f.estado_captura ?? "sin_captura",
    personas_afectadas: f.personas_afectadas ?? 0, hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin, tipo: f.tipo, sala: f.sala,
    personas_visita: f.personas_visita ?? 0, entradas_totales: f.entradas_totales,
    captura_automatica: f.captura_automatica, sesion_id: f.sesion_id,
  }));
  const slotDe = new Map(slots.map((s) => [s.slot_id, s]));
  // El demo guarda la franja en `franja`; `asist_roster` la llama `slot_id`.
  // Ademas solo cuenta si esa franja existe en la semana: en los modulos JS la
  // Programacion cubria 680 de las 726 personas del canon y las otras 46
  // quedaron con `slot_id` vacio. A nadie se le puede marcar ausencia de una
  // clase a la que nunca estuvo asignado, asi que quedan fuera del roster
  // medible y se reportan aparte (2026-09-21).
  const franjaDe = new Map(
    raw.roster
      .map((p) => [p.persona_id, p.franja ?? p.slot_id] as [string, string])
      .filter(([, f]) => f && slotDe.has(f)),
  );
  const conHorario = raw.roster.filter((p) => franjaDe.has(p.persona_id));
  const conHorarioIds = new Set(conHorario.map((p) => p.persona_id));
  const sinHorario = raw.roster.length - conHorario.length;
  const sessionDe = new Map<string, Fila>();
  for (const s of raw.franjas) {
    sessionDe.set(s.sesion_id ?? `${raw.semana}|${s.slot_id}`, s);
    sessionDe.set(s.slot_id, s);
  }

  const own = new Set<string>();
  const other = new Set<string>();
  const ownBySlot = new Map<string, Set<string>>();
  const otherBySlot = new Map<string, Set<string>>();
  for (const entry of raw.entradas ?? []) {
    const person = personaDe.get(entry.persona_id);
    const session = sessionDe.get(entry.sesion_id);
    if (!person || !session) continue;
    const assigned = franjaDe.get(entry.persona_id);
    const destination = session.slot_id;
    if (assigned && assigned === destination) {
      own.add(entry.persona_id);
      const set = ownBySlot.get(assigned) ?? new Set<string>();
      set.add(entry.persona_id);
      ownBySlot.set(assigned, set);
    } else if (assigned) {
      other.add(entry.persona_id);
      const set = otherBySlot.get(assigned) ?? new Set<string>();
      set.add(entry.persona_id);
      otherBySlot.set(assigned, set);
    }
  }

  // The demo fixture predates asist_entradas. Keep it useful without changing
  // its source data; real data always takes the entradas path above.
  if (!(raw.entradas?.length)) {
    const fechaDe = new Map(slots.map((s) => [s.slot_id, s.fecha]));
    for (const cell of raw.celdas_dia) {
      const assigned = franjaDe.get(cell.persona_id);
      if (!assigned || fechaDe.get(assigned) !== cell.fecha) continue;
      if (cell.estado === "V") { own.add(cell.persona_id); const set = ownBySlot.get(assigned) ?? new Set<string>(); set.add(cell.persona_id); ownBySlot.set(assigned, set); }
      if (cell.estado === "A") { other.add(cell.persona_id); const set = otherBySlot.get(assigned) ?? new Set<string>(); set.add(cell.persona_id); otherBySlot.set(assigned, set); }
    }
  }
  const otherOnly = new Set([...other].filter((id) => !own.has(id)));
  const visitadasPorPersona = new Map<string, Set<string>>();
  for (const entry of raw.entradas ?? []) {
    const slot = sessionDe.get(entry.sesion_id)?.slot_id;
    if (!slot) continue;
    const visitadas = visitadasPorPersona.get(entry.persona_id) ?? new Set<string>();
    visitadas.add(slot);
    visitadasPorPersona.set(entry.persona_id, visitadas);
  }
  const tieneCeldasDemo = !(raw.entradas?.length);
  const franjasConClaseIds = new Set(slots.filter((slot) => {
    if (!["capturada", "recuperada_csv"].includes(slot.estado_captura)) return false;
    const esSoporte = slot.captura_automatica === false || slot.cuenta_zoom === "soporte" ||
      (slot.tipo ?? "").toLowerCase().includes("soporte");
    if (esSoporte && slot.estado_captura !== "recuperada_csv") return false;
    const tieneEventos = Number(slot.entradas_totales ?? 0) > 0 || Number(slot.personas_visita ?? 0) > 0 ||
      (ownBySlot.get(slot.slot_id)?.size ?? 0) > 0 ||
      (tieneCeldasDemo && raw.celdas_dia.some((cell) => cell.fecha === slot.fecha &&
        franjaDe.get(cell.persona_id) === slot.slot_id && ["V", "A", "N"].includes(cell.estado)));
    return tieneEventos;
  }).map((slot) => slot.slot_id));
  const franjas_con_clase = slots.filter((slot) => franjasConClaseIds.has(slot.slot_id))
    .map((slot) => ({ ...slot, tuvo_clase_virtual: true }));
  const rosterActivo = conHorario.filter((p) => franjasConClaseIds.has(franjaDe.get(p.persona_id) ?? ""));
  const rosterActivoIds = new Set(rosterActivo.map((p) => p.persona_id));
  const ownActivo = new Set([...own].filter((id) => rosterActivoIds.has(id)));
  const otherActivo = new Set([...otherOnly].filter((id) => rosterActivoIds.has(id)));
  const zLPeople = new Set([...semanal].filter(([id, state]) => state === "ZL" && rosterActivoIds.has(id)).map(([id]) => id));
  const pPeople = new Set([...semanal].filter(([id, state]) => state === "P" && rosterActivoIds.has(id)).map(([id]) => id));
  const siPeople = new Set([...semanal].filter(([id, state]) => state === "SI" && rosterActivoIds.has(id)).map(([id]) => id));
  const noDataRoster = zLPeople.size;
  const fallbackNoData = franjas_con_clase.filter((s) => SIN_DATO.has(s.estado_captura)).reduce((n, s) => n + (s.roster_n ?? 0), 0);
  const fueraDato = noDataRoster || (raw.entradas?.length ? 0 : fallbackNoData);

  const por_franja = franjas_con_clase.map((slot) => {
    const assigned = raw.roster.filter((p) => franjaDe.get(p.persona_id) === slot.slot_id);
    const fuera = assigned.filter((p) => zLPeople.has(p.persona_id)).length;
    const pend = assigned.filter((p) => pPeople.has(p.persona_id)).length;
    const rosterCount = (assigned.length || slot.roster_n) ?? 0;
    const medible = Math.max(rosterCount - fuera - pend, 0);
    const ownCount = [...(ownBySlot.get(slot.slot_id) ?? [])].filter((id) => rosterActivoIds.has(id)).length;
    const otherCount = [...(otherBySlot.get(slot.slot_id) ?? [])].filter((id) => rosterActivoIds.has(id) && !ownActivo.has(id)).length;
    const si = assigned.filter((p) => siPeople.has(p.persona_id)).length;
    return { slot_id: slot.slot_id, fecha: slot.fecha, roster: rosterCount,
      entro: ownCount, aOtra: otherCount,
      falto: Math.max(medible - si, 0), medible, fueraDato: fuera, pendiente: pend };
  });
  const weekly = crearCorte("Total", rosterActivo.length, fueraDato, pPeople.size, ownActivo.size, otherActivo.size, siPeople.size);

  const por_dia = [...new Set(franjas_con_clase.map((s) => s.fecha))].sort().map((fecha) => {
    const rows = por_franja.filter((f) => f.fecha === fecha);
    const counts: Record<string, number> = {};
    for (const c of raw.celdas_dia) if (c.fecha === fecha && rosterActivoIds.has(c.persona_id)) counts[c.estado] = (counts[c.estado] ?? 0) + 1;
    return { fecha, counts, total: Object.values(counts).reduce((a, n) => a + n, 0), roster: rows.reduce((a, r) => a + r.roster, 0), medible: rows.reduce((a, r) => a + r.medible, 0), entro: rows.reduce((a, r) => a + r.entro, 0), aOtra: rows.reduce((a, r) => a + r.aOtra, 0), falto: rows.reduce((a, r) => a + r.falto, 0), fueraDato: rows.reduce((a, r) => a + r.fueraDato, 0) };
  });

  const makeCut = (key: (p: Fila) => string) => [...new Set(rosterActivo.map(key).filter(Boolean))].sort().map((label) => {
    const people = rosterActivo.filter((p) => key(p) === label);
    const ids = new Set(people.map((p) => p.persona_id));
    const ownN = [...ownActivo].filter((id) => ids.has(id)).length;
    const otherN = [...otherActivo].filter((id) => ids.has(id)).length;
    const siN = [...siPeople].filter((id) => ids.has(id)).length;
    const zN = [...zLPeople].filter((id) => ids.has(id)).length;
    const pN = [...pPeople].filter((id) => ids.has(id)).length;
    return crearCorte(label, people.length, zN, pN, ownN, otherN, siN);
  });
  const accountOf = (p: Fila) => slotDe.get(franjaDe.get(p.persona_id) ?? "")?.cuenta_zoom ?? "Sin cuenta";
  const por_ciudad = makeCut((p) => p.ciudad ?? "Sin ciudad");
  const por_cuenta = makeCut(accountOf);
  const counts: Record<string, number> = {};
  for (const c of raw.celdas_dia) if (rosterActivoIds.has(c.persona_id) && franjasConClaseIds.has(franjaDe.get(c.persona_id) ?? "")) counts[c.estado] = (counts[c.estado] ?? 0) + 1;
  // Los totales semanales se fijan al final a proposito: sembrarlos antes hacia
  // que los estados diarios —que tambien usan ZL— se sumaran encima, y la
  // tarjeta "Sin dato" llego a marcar 1.010 sobre un roster de 726.
  counts.roster = rosterActivo.length;
  counts.SI = siPeople.size;
  counts.ZL = zLPeople.size;
  counts.NO = weekly.falto;
  counts.medible = weekly.medible;
  counts.P = pPeople.size;
  counts.sinHorario = conHorario.length - rosterActivo.length + sinHorario;
  // asist_no_identificados guarda una fila por (semana, sesion_id, motivo): con 14
  // franjas, un mismo motivo aparece repetido una vez por sesión. Sin sumar por
  // motivo, la UI mostraba filas con la misma key (React solo pintaba la última,
  // ocultando el resto de las sesiones).
  const noIdentPorMotivo = new Map<string, number>();
  for (const r of raw.no_identificados) noIdentPorMotivo.set(r.motivo, (noIdentPorMotivo.get(r.motivo) ?? 0) + r.cantidad);
  const no_identificados = [...noIdentPorMotivo.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad }));
  const porFecha = new Map(raw.celdas_dia.map((c) => [`${c.persona_id}|${c.fecha}`, c.estado]));
  const filasPorPersona = new Map<string, Fila>();
  const franjasPorPersona = new Map<string, Set<string>>();
  for (const persona of raw.roster) {
    if (!filasPorPersona.has(persona.persona_id)) filasPorPersona.set(persona.persona_id, persona);
    const slotId = persona.franja ?? persona.slot_id;
    if (!franjasConClaseIds.has(slotId)) continue;
    const asignadas = franjasPorPersona.get(persona.persona_id) ?? new Set<string>();
    asignadas.add(slotId);
    franjasPorPersona.set(persona.persona_id, asignadas);
  }
  const participantes: ParticipanteSemana[] = [...filasPorPersona]
    .filter(([personaId]) => (franjasPorPersona.get(personaId)?.size ?? 0) > 0)
    .map(([personaId, p], index) => {
    const franjas = [...(franjasPorPersona.get(personaId) ?? [])].sort();
    const slotId = franjas[0] ?? "";
    const estado_semana = semanal.get(personaId) ?? "-";
    const estado_por_franja: Record<string, string> = {};
    for (const ownSlot of franjas) {
      const slot = slotDe.get(ownSlot);
      const celda = slot ? porFecha.get(`${personaId}|${slot.fecha}`) : undefined;
      estado_por_franja[ownSlot] = celda ??
        (ownBySlot.get(ownSlot)?.has(personaId) ? "V" :
          other.has(personaId) ? "A" : estado_semana);
    }
    const propia = Object.values(estado_por_franja).some((estado) => PROPIA.has(estado));
    const rescatada = !propia && Object.values(estado_por_franja).some((estado) => OTRA.has(estado));
    const nombre = options.incluirNombres ? nombreBreve(p) : undefined;
    return { key: `persona-${index + 1}`, ...(nombre ? { nombre } : {}), franja: slotId, franjas,
      estado_semana, propia, rescatada, ingreso_en_semana: propia || rescatada,
      falta_hasta_hoy: !propia && !rescatada, estado_por_franja };
  });
  const dias_visibles = [...new Set(franjas_con_clase.map((slot) => slot.fecha))].sort().map((fecha) => {
    const corte = crearCorteVisual(participantes, franjas_con_clase, { fecha });
    return { fecha, noIngresaron: corte.noIngresaron, rescataron: corte.rescataron,
      sinIngresarHastaHoy: corte.sinIngresarHastaHoy };
  });
  const faltantes_por_franja = crearCorteVisual(participantes, franjas_con_clase).grupos_faltantes;
  return { semana: raw.semana, materia: raw.materia ?? "", estado_semana: raw.estado_semana ?? "",
    semana_registrada: raw.semana_registrada ?? true,
    ciudades: [...new Set(rosterActivo.map((p) => p.ciudad).filter(Boolean))].sort(), franjas: slots,
    franjas_con_clase, por_franja, por_dia, resumen: weekly, por_ciudad, por_cuenta,
    sinHorario: sinHorario + conHorario.length - rosterActivo.length,
    no_identificados, counts, participantes, dias_visibles, faltantes_por_franja };
}
