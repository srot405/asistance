// Reporte CSV nominal completo de una semana (TOC-91, 2026-10-05): sirve aunque la
// captura este incompleta (ZL, P, NO?). Puro, sin I/O. NO reclasifica: usa
// clasificar() de detalleCalculo.mjs y el estado ya guardado en asist_celda_semana.
// Nunca convierte ZL/P/sin dato en "NO". Cuadre: roster = medible + fueraDato +
// pendiente + sinClase (sinClase suele ser 0).
import { clasificar, entroEnFecha } from "./detalleCalculo.mjs";

export const BOM = "﻿";
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const line = (row) => row.map(csv).join(",");

export const LEYENDA = "SI=ingreso | NO=no ingreso (captura completa) | NO?=sin ingreso, por revisar (semana en revision) | " +
  "ZL=Zoom limit, sin dato (NO es ausencia) | P=clase aun no ocurre (pendiente) | sin clase=sin franja o sin clase ocurrida | sin dato=sin estado guardado";

const MOTIVOS = {
  zoom_limit_pendiente: "Zoom limit: la sala no pudo capturarse, sin dato (no es ausencia)",
  por_ocurrir: "La clase aun no ocurre",
  en_curso: "Clase en curso, captura parcial",
  sin_captura: "Sin captura de Zoom",
  sin_sesion: "No existe sesion registrada para la franja",
};

// clasificar() manda a "sin_clase" a quien tiene franja pero ninguna sesion con entradas ese
// dia (p.ej. un dia entero en ZL). Para el reporte eso esconderia ZL/P: si la celda guardada
// dice ZL o P y la persona tiene franja, se respeta la celda (fuera de dato / pendiente).
function categoria(persona, base) {
  const clase = clasificar(persona, base);
  if (clase !== "sin_clase" || !persona.slot_id) return clase;
  const celda = base.celdaPorPersona.get(persona.persona_id);
  if (celda === "ZL") return "sin_dato";
  if (celda === "P") return "pendiente";
  return clase;
}

function estadoSemana(persona, base) {
  if (categoria(persona, base) === "sin_clase") return "sin clase";
  return base.celdaPorPersona.get(persona.persona_id) ?? "sin dato";
}

export function construirReporteSemana(semana, base, resumen = null) {
  const sesionPorSlot = new Map((base.sesiones ?? []).map((s) => [s.slot_id, s]));
  const franjas = [...base.franjas.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));
  const cuadre = { roster: base.roster.length, medible: 0, fueraDato: 0, pendiente: 0, sinClase: 0 };
  const filas = [];
  const afectadas = new Map();
  for (const p of base.roster) {
    const clase = categoria(p, base);
    if (clase === "medible") cuadre.medible++;
    else if (clase === "pendiente") cuadre.pendiente++;
    else if (clase === "sin_dato") cuadre.fueraDato++;
    else cuadre.sinClase++;
    const franja = p.slot_id ? base.franjas.get(p.slot_id) : undefined;
    const fecha = franja?.fecha ?? "";
    const semanal = estadoSemana(p, base);
    let dia = semanal;
    if (fecha && entroEnFecha(base, p.persona_id, fecha)) dia = "SI";
    else if (semanal === "SI") dia = "SI (otra franja)";
    filas.push({ nombre: p.nombre, ciudad: p.ciudad, franja: p.slot_id ?? "", fecha, semanal, dia });
    if (p.slot_id) afectadas.set(p.slot_id, (afectadas.get(p.slot_id) ?? 0) + 1);
  }
  const sinDato = [];
  for (const f of franjas) {
    const ses = sesionPorSlot.get(f.slot_id);
    const estado = ses?.estado_captura ?? "sin_sesion";
    if (estado === "capturada") continue;
    sinDato.push({ fecha: f.fecha, franja: f.slot_id, estado, motivo: MOTIVOS[estado] ?? `Estado de captura: ${estado}`,
      personas: afectadas.get(f.slot_id) ?? 0 });
  }
  const hayRevision = filas.some((f) => f.semanal === "NO?");
  const completa = sinDato.length === 0 && resumen?.captura_completa !== false && !hayRevision;
  const cuadra = cuadre.roster === cuadre.medible + cuadre.fueraDato + cuadre.pendiente + cuadre.sinClase;
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.franja.localeCompare(b.franja));
  return { semana, completa, hayRevision, cuadre, cuadra, sinDato, filas, nivel: resumen?.nivel ?? "Detalle" };
}

export function construirCsvReporte(r) {
  const header = ["tipo_fila", "semana", "nombre", "ciudad", "franja", "fecha", "estado_semana", "estado_dia", "detalle"];
  const c = r.cuadre;
  const estadoCaptura = r.completa ? "captura completa" : "captura incompleta";
  const filas = [line(header),
    line(["RESUMEN", r.semana, "", "", "", "", "", "", `${estadoCaptura}; roster=${c.roster}; medible=${c.medible}; ` +
      `fuera_dato=${c.fueraDato}; pendiente=${c.pendiente}; sin_clase=${c.sinClase}; cuadre=${r.cuadra ? "OK" : "DESCUADRADO"}` +
      `${r.hayRevision ? "; semana en revision (NO? por confirmar)" : ""}`]),
    line(["LEYENDA", r.semana, "", "", "", "", "", "", LEYENDA]),
    ...r.sinDato.map((s) => line(["FRANJA_SIN_DATO", r.semana, "", "", s.franja, s.fecha, "", "",
      `${s.motivo}; personas_afectadas=${s.personas}`])),
    ...r.filas.map((f) => line(["PERSONA", r.semana, f.nombre, f.ciudad, f.franja, f.fecha, f.semanal, f.dia, ""])),
  ];
  return { contenido: BOM + filas.join("\r\n") + "\r\n", archivo: r.completa ? "reporte_completo" : "reporte_captura_incompleta" };
}
