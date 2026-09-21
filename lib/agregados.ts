import type { DemoData, Slot } from "./types";

type Fila = Record<string, any>;

export function agregarDatos(raw: {
  semana: string;
  materia?: string;
  estado_semana?: string;
  roster: Fila[];
  franjas: Fila[];
  celdas_dia: Fila[];
  celdas_semana: Fila[];
  no_identificados: Fila[];
}): DemoData {
  const franjaDe = new Map(raw.roster.map((p) => [p.persona_id, p.franja]));
  const fechaDe = new Map(raw.franjas.map((f) => [f.slot_id, f.fecha]));
  const porFranja = new Map<string, { entro: number; aOtra: number }>();
  const porDia = new Map<string, Record<string, number>>();
  const counts: Record<string, number> = { roster: raw.roster.length };

  for (const celda of raw.celdas_dia) {
    const dia = porDia.get(celda.fecha) ?? {};
    dia[celda.estado] = (dia[celda.estado] ?? 0) + 1;
    porDia.set(celda.fecha, dia);
    counts[celda.estado] = (counts[celda.estado] ?? 0) + 1;
    const slot = franjaDe.get(celda.persona_id);
    if (slot && fechaDe.get(slot) === celda.fecha) {
      const acc = porFranja.get(slot) ?? { entro: 0, aOtra: 0 };
      if (celda.estado === "V") acc.entro += 1;
      if (celda.estado === "A") acc.aOtra += 1;
      porFranja.set(slot, acc);
    }
  }
  const semanal = new Map(raw.celdas_semana.map((c) => [c.persona_id, c.estado]));
  const falto = new Map<string, number>();
  for (const [persona, slot] of franjaDe) {
    if (["NO", "NO?"].includes(semanal.get(persona))) falto.set(slot, (falto.get(slot) ?? 0) + 1);
  }
  for (const c of raw.celdas_semana) counts[c.estado] = (counts[c.estado] ?? 0) + 1;
  const slots: Slot[] = raw.franjas.map((f) => ({
    slot_id: f.slot_id, fecha: f.fecha, cuenta_zoom: f.cuenta_zoom,
    roster_n: f.roster_n ?? 0, estado_captura: f.estado_captura ?? "sin_captura",
    personas_afectadas: f.personas_afectadas ?? 0, hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin, tipo: f.tipo, sala: f.sala,
    personas_visita: f.personas_visita ?? 0, entradas_totales: f.entradas_totales,
  }));
  const por_franja = slots.map((f) => {
    const acc = porFranja.get(f.slot_id) ?? { entro: 0, aOtra: 0 };
    return { slot_id: f.slot_id, fecha: f.fecha, roster: f.roster_n ?? 0,
      entro: acc.entro, aOtra: acc.aOtra, colados: f.personas_visita ?? 0,
      falto: falto.get(f.slot_id) ?? 0 };
  });
  return {
    semana: raw.semana, materia: raw.materia ?? "", estado_semana: raw.estado_semana ?? "",
    ciudades: [...new Set(raw.roster.map((p) => p.ciudad).filter(Boolean))].sort(),
    franjas: slots, por_franja,
    por_dia: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, day]) => ({ fecha, counts: day, total: Object.values(day).reduce((a, b) => a + b, 0) })),
    no_identificados: raw.no_identificados.map((r) => ({ motivo: r.motivo, cantidad: r.cantidad })), counts,
  };
}
