// Datos SINTÉTICOS (nadie real) para probar el calendario + CSV nominal en
// MODO_DEMO. Mismo formato de fila que las tablas asist_roster/asist_franjas/
// asist_sesiones/asist_entradas/asist_celda_semana (ver
// backend/etl/migraciones/001_esquema.sql), pero con nombres y cédulas
// inventados a propósito ("Persona Demo NN") para que nunca se confundan con
// datos reales. Solo cubre las dos semanas nivel "Detalle" del histórico demo:
// 2026-09-14 y 2026-09-21 (ver lib/historico-demo.mjs).
//
// Regenerar a mano si cambia la forma de lib/servidor/leerDetalleSemana.ts.

const CIUDADES = ["Bogotá", "Medellín", "Cali", "Barranquilla"];

function generarSemana(semana, slots) {
  const roster = [];
  const franjas = [];
  const sesiones = [];
  const entradas = [];
  const celdas = [];
  let contador = 0;
  for (const slot of slots) {
    franjas.push({ slot_id: slot.slot_id, fecha: slot.fecha, cuenta_zoom: slot.cuenta_zoom,
      horario_texto: slot.horario_texto });
    const sesionId = `demo-${semana}-${slot.slot_id}`;
    sesiones.push({ sesion_id: sesionId, slot_id: slot.slot_id, fecha: slot.fecha,
      estado_captura: "capturada", entradas_totales: slot.faltan < slot.n ? slot.n - slot.faltan : 0 });
    for (let i = 0; i < slot.n; i += 1) {
      contador += 1;
      const personaId = `demo-${semana}-${contador}`;
      const ciudad = CIUDADES[contador % CIUDADES.length];
      const entro = i >= slot.faltan; // los primeros `faltan` de cada franja no entran
      roster.push({ persona_id: personaId, nombre: `Persona Demo ${String(contador).padStart(2, "0")}`,
        ciudad, slot_id: slot.slot_id });
      celdas.push({ persona_id: personaId, estado: entro ? "SI" : "NO" });
      if (entro) entradas.push({ persona_id: personaId, sesion_id: sesionId });
    }
  }
  return { roster, franjas, sesiones, entradas, celdas };
}

export const DETALLE_DEMO_BASE = {
  "2026-09-14": generarSemana("2026-09-14", [
    { slot_id: "backend-martes-18", fecha: "2026-09-15", cuenta_zoom: "comunicaciones",
      horario_texto: "Martes 18:00", n: 6, faltan: 2 },
    { slot_id: "backend-miércoles-18", fecha: "2026-09-16", cuenta_zoom: "jovenescreativos",
      horario_texto: "Miércoles 18:00", n: 6, faltan: 2 },
    { slot_id: "backend-jueves-10", fecha: "2026-09-17", cuenta_zoom: "soporte",
      horario_texto: "Jueves 10:00", n: 6, faltan: 1 },
    { slot_id: "backend-sábado-08-uno", fecha: "2026-09-19", cuenta_zoom: "comunicaciones",
      horario_texto: "Sábado 08:00", n: 6, faltan: 2 },
  ]),
  "2026-09-21": generarSemana("2026-09-21", [
    { slot_id: "backend-martes-18", fecha: "2026-09-22", cuenta_zoom: "comunicaciones",
      horario_texto: "Martes 18:00", n: 6, faltan: 3 },
    { slot_id: "backend-miércoles-18", fecha: "2026-09-23", cuenta_zoom: "jovenescreativos",
      horario_texto: "Miércoles 18:00", n: 6, faltan: 1 },
    { slot_id: "backend-jueves-10", fecha: "2026-09-24", cuenta_zoom: "soporte",
      horario_texto: "Jueves 10:00", n: 6, faltan: 2 },
    { slot_id: "backend-viernes-16", fecha: "2026-09-25", cuenta_zoom: "comunicaciones",
      horario_texto: "Viernes 16:00", n: 6, faltan: 3 },
  ]),
};
