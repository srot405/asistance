const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const line = (row) => row.map(csv).join(",");

export function construirCsv(data, vista, demo = false) {
  if (vista === "Resumen") {
    const header = ["fecha", "franja", "roster", "entro", "a_otra", "falto"];
    const rows = data.por_franja.map((r) => [r.fecha, r.slot_id, r.roster, r.entro, r.aOtra, r.falto]);
    return { contenido: [line(header), ...rows.map(line)].join("\r\n") + "\r\n", archivo: "resumen" };
  }
  if (vista === "Asistencia por horario") {
    const slots = data.franjas_con_clase;
    const header = ["nombre", "franja", "estado_semanal", ...slots.map((s) => s.slot_id)];
    const rows = data.participantes.map((p, index) => [
      demo ? `Participante ${String(index + 1).padStart(3, "0")}` : (p.nombre ?? ""),
      p.franja, p.estado_semana, ...slots.map((s) => p.estado_por_franja[s.slot_id] ?? "-"),
    ]);
    return { contenido: [line(header), ...rows.map(line)].join("\r\n") + "\r\n", archivo: "asistencia_por_horario" };
  }
  throw new RangeError("Vista de exportación no válida");
}
