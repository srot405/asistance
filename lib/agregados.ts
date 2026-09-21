import type { CorteResumen, DemoData, Slot } from "./types";

type Fila = Record<string, any>;
const SIN_DATO = new Set(["zoom_limit_pendiente", "sin_captura", "dudosa"]);
const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);

// `fueraDato` (ZL: no pudimos medir) y `pendiente` (P: la clase no ha ocurrido)
// son dos razones distintas para no ser medible, y ninguna es una ausencia.
// Sin restar `pendiente`, la semana en curso daba medible=726 y falto=726: el
// panel afirmaba que 726 personas faltaron a clases que no han pasado.
function crearCorte(etiqueta: string, roster: number, fueraDato: number, pendiente: number, entro: number, aOtra: number, colados: number, si: number): CorteResumen {
  const medible = Math.max(roster - fueraDato - pendiente, 0);
  return { etiqueta, roster, medible, fueraDato, pendiente, entro, aOtra, colados, si, falto: Math.max(medible - si, 0), asistenciaPct: pct(si, medible) };
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
}): DemoData {
  const personaDe = new Map(raw.roster.map((p) => [p.persona_id, p]));
  const semanal = new Map(raw.celdas_semana.map((c) => [c.persona_id, c.estado]));
  const slots: Slot[] = raw.franjas.map((f) => ({
    slot_id: f.slot_id, fecha: f.fecha, cuenta_zoom: f.cuenta_zoom,
    roster_n: f.roster_n ?? 0, estado_captura: f.estado_captura ?? "sin_captura",
    personas_afectadas: f.personas_afectadas ?? 0, hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin, tipo: f.tipo, sala: f.sala,
    personas_visita: f.personas_visita ?? 0, entradas_totales: f.entradas_totales,
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
  const visitsBySlot = new Map<string, number>();
  const ownBySlot = new Map<string, Set<string>>();
  const otherBySlot = new Map<string, Set<string>>();
  const cityVisitors = new Map<string, number>();
  const accountVisitors = new Map<string, number>();
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
    } else {
      if (assigned) {
        other.add(entry.persona_id);
        const set = otherBySlot.get(assigned) ?? new Set<string>();
        set.add(entry.persona_id);
        otherBySlot.set(assigned, set);
      }
      visitsBySlot.set(destination, (visitsBySlot.get(destination) ?? 0) + 1);
      if (person.ciudad) cityVisitors.set(person.ciudad, (cityVisitors.get(person.ciudad) ?? 0) + 1);
      const account = session.cuenta_zoom;
      if (account) accountVisitors.set(account, (accountVisitors.get(account) ?? 0) + 1);
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
  const zLPeople = new Set([...semanal].filter(([id, state]) => state === "ZL" && conHorarioIds.has(id)).map(([id]) => id));
  const pPeople = new Set([...semanal].filter(([id, state]) => state === "P" && conHorarioIds.has(id)).map(([id]) => id));
  const siPeople = new Set([...semanal].filter(([id, state]) => state === "SI" && conHorarioIds.has(id)).map(([id]) => id));
  const noDataRoster = zLPeople.size;
  const fallbackNoData = slots.filter((s) => SIN_DATO.has(s.estado_captura)).reduce((n, s) => n + (s.roster_n ?? 0), 0);
  const fueraDato = noDataRoster || (raw.entradas?.length ? 0 : fallbackNoData);

  const por_franja = slots.map((slot) => {
    const assigned = raw.roster.filter((p) => franjaDe.get(p.persona_id) === slot.slot_id);
    const fuera = assigned.filter((p) => zLPeople.has(p.persona_id)).length;
    const pend = assigned.filter((p) => pPeople.has(p.persona_id)).length;
    const rosterCount = (assigned.length || slot.roster_n) ?? 0;
    const medible = Math.max(rosterCount - fuera - pend, 0);
    const ownCount = ownBySlot.get(slot.slot_id)?.size ?? 0;
    const otherCount = [...(otherBySlot.get(slot.slot_id) ?? [])].filter((id) => !own.has(id)).length;
    const si = assigned.filter((p) => siPeople.has(p.persona_id)).length;
    return { slot_id: slot.slot_id, fecha: slot.fecha, roster: rosterCount,
      entro: ownCount, aOtra: otherCount, colados: visitsBySlot.get(slot.slot_id) ?? slot.personas_visita ?? 0,
      falto: Math.max(medible - si, 0), medible, fueraDato: fuera, pendiente: pend };
  });
  const weekly = crearCorte("Total", conHorario.length, fueraDato, pPeople.size, own.size, otherOnly.size, [...visitsBySlot.values()].reduce((a, n) => a + n, 0) || slots.reduce((a, s) => a + (s.personas_visita ?? 0), 0), siPeople.size);

  const por_dia = [...new Set(slots.map((s) => s.fecha))].sort().map((fecha) => {
    const rows = por_franja.filter((f) => f.fecha === fecha);
    const counts: Record<string, number> = {};
    for (const c of raw.celdas_dia) if (c.fecha === fecha && conHorarioIds.has(c.persona_id)) counts[c.estado] = (counts[c.estado] ?? 0) + 1;
    return { fecha, counts, total: Object.values(counts).reduce((a, n) => a + n, 0), roster: rows.reduce((a, r) => a + r.roster, 0), medible: rows.reduce((a, r) => a + r.medible, 0), entro: rows.reduce((a, r) => a + r.entro, 0), aOtra: rows.reduce((a, r) => a + r.aOtra, 0), colados: rows.reduce((a, r) => a + r.colados, 0), falto: rows.reduce((a, r) => a + r.falto, 0), fueraDato: rows.reduce((a, r) => a + r.fueraDato, 0) };
  });

  const makeCut = (key: (p: Fila) => string, visitorMap: Map<string, number>) => [...new Set(conHorario.map(key).filter(Boolean))].sort().map((label) => {
    const people = conHorario.filter((p) => key(p) === label);
    const ids = new Set(people.map((p) => p.persona_id));
    const ownN = [...own].filter((id) => ids.has(id)).length;
    const otherN = [...otherOnly].filter((id) => ids.has(id)).length;
    const siN = [...siPeople].filter((id) => ids.has(id)).length;
    const zN = [...zLPeople].filter((id) => ids.has(id)).length;
    const pN = [...pPeople].filter((id) => ids.has(id)).length;
    return crearCorte(label, people.length, zN, pN, ownN, otherN, visitorMap.get(label) ?? 0, siN);
  });
  const accountOf = (p: Fila) => slotDe.get(franjaDe.get(p.persona_id) ?? "")?.cuenta_zoom ?? "Sin cuenta";
  const por_ciudad = makeCut((p) => p.ciudad ?? "Sin ciudad", cityVisitors);
  const por_cuenta = makeCut(accountOf, accountVisitors);
  const counts: Record<string, number> = {};
  for (const c of raw.celdas_dia) if (conHorarioIds.has(c.persona_id)) counts[c.estado] = (counts[c.estado] ?? 0) + 1;
  // Los totales semanales se fijan al final a proposito: sembrarlos antes hacia
  // que los estados diarios —que tambien usan ZL— se sumaran encima, y la
  // tarjeta "Sin dato" llego a marcar 1.010 sobre un roster de 726.
  counts.roster = conHorario.length;
  counts.SI = siPeople.size;
  counts.ZL = zLPeople.size;
  counts.NO = weekly.falto;
  counts.medible = weekly.medible;
  counts.P = pPeople.size;
  counts.sinHorario = sinHorario;
  return { semana: raw.semana, materia: raw.materia ?? "", estado_semana: raw.estado_semana ?? "", ciudades: [...new Set(conHorario.map((p) => p.ciudad).filter(Boolean))].sort(), franjas: slots, por_franja, por_dia, resumen: weekly, por_ciudad, por_cuenta, sinHorario, no_identificados: raw.no_identificados.map((r) => ({ motivo: r.motivo, cantidad: r.cantidad })), counts };
}
