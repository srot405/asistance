import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dates = [
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
];
const slots = [
  ["backend-jueves-10", "2026-09-18", "comunicaciones", 45],
  ["backend-jueves-16-avanzado", "2026-09-18", "comunicaciones", 55],
  ["backend-martes-18", "2026-09-15", "comunicaciones", 50],
  ["backend-miércoles-18", "2026-09-16", "jovenescreativos", 55],
  ["backend-sábado-08-avanzado", "2026-09-19", "soporte", 55],
  ["backend-sábado-08-dos", "2026-09-19", "jovenescreativos", 52],
  ["backend-sábado-08-uno", "2026-09-19", "comunicaciones", 50],
  ["backend-sábado-10", "2026-09-19", "jovenescreativos", 52],
  ["backend-sábado-10-avanzado", "2026-09-19", "soporte", 50],
  ["backend-sábado-14-avanzado", "2026-09-19", "soporte", 46],
  ["backend-sábado-14-uno", "2026-09-19", "comunicaciones", 52],
  ["backend-sábado-16-avanzado", "2026-09-19", "soporte", 57],
  ["backend-sábado-16-uno", "2026-09-19", "comunicaciones", 54],
  ["backend-viernes-16", "2026-09-17", "jovenescreativos", 53],
];
const roster = Array.from({ length: 726 }, (_, i) => ({
  persona_id: `demo-${String(i + 1).padStart(3, "0")}`,
  nombre: `Estudiante ${String(i + 1).padStart(3, "0")}`,
  ciudad: ["Bogotá", "Cali", "Medellín"][i % 3],
  franja: slots[i % slots.length][0],
}));
const desired = [
  ["V", 63],
  ["A", 2],
  ["N", 3],
  ["R?", 40],
  ["P", 621],
  ["-", 2901],
];
const statusList = desired.flatMap(([code, n]) =>
  Array.from({ length: n }, () => code),
);
const celdas_dia = [];
for (let i = 0; i < 726; i++)
  for (let d = 0; d < dates.length; d++)
    celdas_dia.push({
      persona_id: roster[i].persona_id,
      fecha: dates[d],
      estado: statusList[i * dates.length + d],
    });
const celdas_semana = [
  ...Array.from({ length: 66 }, (_, i) => ({
    persona_id: roster[i].persona_id,
    estado: "SI",
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    persona_id: roster[i + 66].persona_id,
    estado: "NO?",
  })),
  ...Array.from({ length: 620 }, (_, i) => ({
    persona_id: roster[i + 106].persona_id,
    estado: "P",
  })),
];
const slotDetails = new Map(
  slots.map(([slot_id, fecha, cuenta_zoom, roster_n], index) => [
    slot_id,
    {
      slot_id,
      fecha,
      cuenta_zoom,
      roster_n,
      hora_inicio: 8 + (index % 5) * 2,
      hora_fin: 10 + (index % 5) * 2,
      tipo: slot_id.includes("avanzado") ? "Avanzado" : "Basico",
      sala: `Sala demo ${index + 1}`,
      estado_captura: ["backend-martes-18", "backend-miércoles-18"].includes(
        slot_id,
      )
        ? "capturada"
        : "por_ocurrir",
      personas_afectadas: cuenta_zoom === "soporte" ? roster_n : 0,
    },
  ]),
);
const rosterMap = new Map(roster.map((person) => [person.persona_id, person]));
for (const cell of celdas_dia) {
  const person = rosterMap.get(cell.persona_id);
  const slot = slotDetails.get(person.franja);
  if (cell.estado === "V" && slot) {
    cell.sala = slot.sala;
    cell.primera_entrada = `${cell.fecha}T${String(slot.hora_inicio).padStart(2, "0")}:03:00-05:00`;
    cell.origen = "webhook";
  }
}
const data = {
  semana: "2026-09-14",
  materia: "Backend",
  estado_semana: "abierta",
  roster,
  franjas: [...slotDetails.values()],
  celdas_dia,
  celdas_semana,
  no_identificados: [
    { motivo: "correo_no_en_roster", cantidad: 10 },
    { motivo: "staff_excluido", cantidad: 6 },
  ],
  counts: {
    roster: 726,
    V: 63,
    A: 2,
    N: 3,
    "R?": 40,
    P: 621,
    "-": 2901,
    SI: 66,
    "NO?": 40,
    sesiones_capturadas: 2,
    sesiones_por_ocurrir: 12,
  },
};
const older = structuredClone(data);
older.semana = "2026-09-07";
older.estado_semana = "cerrada";
older.celdas_dia = older.celdas_dia.map((c, i) => ({
  ...c,
  fecha: dates[i % dates.length],
  estado: i % 11 === 0 ? "R" : i % 17 === 0 ? "ZL" : c.estado,
}));
older.celdas_semana = older.celdas_semana.map((c, i) => ({
  ...c,
  estado: i % 11 === 0 ? "NO" : i % 17 === 0 ? "ZL" : c.estado,
}));
older.franjas = older.franjas.map((f, i) => ({
  ...f,
  estado_captura:
    i < 4
      ? "zoom_limit_pendiente"
      : i === 4
        ? "recuperada_csv"
        : f.estado_captura,
}));
await mkdir(resolve(root, "data/demo"), { recursive: true });
await writeFile(
  resolve(root, "data/demo/semana-2026-09-14.json"),
  JSON.stringify(data),
);
await writeFile(
  resolve(root, "data/demo/semana-2026-09-07.json"),
  JSON.stringify(older),
);
console.log("RESUMEN: semanas=2 roster=726 franjas=14 archivos=2");
