// Datos SINTÉTICOS (nadie real) para probar el calendario + CSV nominal en
// MODO_DEMO. Mismo formato de fila que las tablas asist_roster/asist_franjas/
// asist_sesiones/asist_entradas/asist_celda_semana (ver
// backend/etl/migraciones/001_esquema.sql), pero con nombres y cédulas
// inventados a propósito ("Persona Demo NN") para que nunca se confundan con
// datos reales. Solo cubre las dos semanas nivel "Detalle" del histórico demo:
// 2026-09-14 y 2026-09-21 (ver lib/historico-demo.mjs).
//
// A propósito usa las 14 franjas y los conteos REALES de roster/entradas de
// Supabase (capturados 2026-09-29), no una muestra reducida inventada: así el
// total de "Ingresos a clases virtuales" (arriba) y el total del calendario
// ("Semana completa", abajo) SIEMPRE cuadran con lib/historico-demo.mjs para
// la misma semana, por construcción, en vez de depender de que alguien los
// arme a mano y se le olvide hacerlos coincidir (bug real, 2026-09-29: el
// primer fixture solo tenía 4 franjas y 24 personas, contra las 726 reales).
// Regenerar a mano si cambia la forma de lib/servidor/leerDetalleSemana.ts,
// o volver a capturar de Supabase si el roster/asistencia real de estas dos
// semanas cambia (ej. una reconstrucción histórica).

const CIUDADES = ["Barranquilla", "Bogotá", "Cartagena", "Medellín", "Cali", "Guayaquil", "Uruguay", "Quito", "Panamá"];

// slot_id/fecha/cuenta_zoom/horario_texto/roster_n/entradas_totales reales, leídos de
// asist_franjas + asist_sesiones el 2026-09-29. `entradas_totales=0` en las 9 franjas del
// sábado 26-sep (semana 21-sep) es real: ese sábado no hubo clase (confirmado por Samuel),
// por eso quedan fuera de "medibles" vía la misma regla que backend/etl/historico_semanal.py.
const SLOTS = {
  "2026-09-14": [
    { slot_id: "backend-martes-18", fecha: "2026-09-15", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00", n: 50, entradas: 35 },
    { slot_id: "backend-miércoles-18", fecha: "2026-09-16", cuenta_zoom: "jovenescreativos", horario_texto: "Miércoles 18:00", n: 56, entradas: 39 },
    { slot_id: "backend-jueves-10", fecha: "2026-09-17", cuenta_zoom: "jovenescreativos", horario_texto: "Jueves 10:00", n: 44, entradas: 37 },
    { slot_id: "backend-jueves-16-avanzado", fecha: "2026-09-17", cuenta_zoom: "jovenescreativos", horario_texto: "Jueves 16:00 Avanzado", n: 55, entradas: 38 },
    { slot_id: "backend-viernes-16", fecha: "2026-09-18", cuenta_zoom: "jovenescreativos", horario_texto: "Viernes 16:00", n: 53, entradas: 40 },
    { slot_id: "backend-sábado-08-avanzado", fecha: "2026-09-19", cuenta_zoom: "soporte", horario_texto: "Sábado 08:00 Avanzado", n: 55, entradas: 42 },
    { slot_id: "backend-sábado-08-dos", fecha: "2026-09-19", cuenta_zoom: "jovenescreativos", horario_texto: "Sábado 08:00 Dos", n: 52, entradas: 27 },
    { slot_id: "backend-sábado-08-uno", fecha: "2026-09-19", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 08:00 Uno", n: 50, entradas: 52 },
    { slot_id: "backend-sábado-10", fecha: "2026-09-19", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 10:00", n: 52, entradas: 46 },
    { slot_id: "backend-sábado-10-avanzado", fecha: "2026-09-19", cuenta_zoom: "soporte", horario_texto: "Sábado 10:00 Avanzado", n: 50, entradas: 46 },
    { slot_id: "backend-sábado-14-avanzado", fecha: "2026-09-19", cuenta_zoom: "soporte", horario_texto: "Sábado 14:00 Avanzado", n: 46, entradas: 31 },
    { slot_id: "backend-sábado-14-uno", fecha: "2026-09-19", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 14:00 Uno", n: 52, entradas: 41 },
    { slot_id: "backend-sábado-16-avanzado", fecha: "2026-09-19", cuenta_zoom: "soporte", horario_texto: "Sábado 16:00 Avanzado", n: 57, entradas: 41 },
    { slot_id: "backend-sábado-16-uno", fecha: "2026-09-19", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 16:00 Uno", n: 54, entradas: 34 },
  ],
  "2026-09-21": [
    { slot_id: "backend-martes-18", fecha: "2026-09-22", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00", n: 50, entradas: 32 },
    { slot_id: "backend-miércoles-18", fecha: "2026-09-23", cuenta_zoom: "jovenescreativos", horario_texto: "Miércoles 18:00", n: 56, entradas: 46 },
    { slot_id: "backend-jueves-10", fecha: "2026-09-24", cuenta_zoom: "jovenescreativos", horario_texto: "Jueves 10:00", n: 44, entradas: 32 },
    { slot_id: "backend-jueves-16-avanzado", fecha: "2026-09-24", cuenta_zoom: "jovenescreativos", horario_texto: "Jueves 16:00 Avanzado", n: 55, entradas: 40 },
    { slot_id: "backend-viernes-16", fecha: "2026-09-25", cuenta_zoom: "jovenescreativos", horario_texto: "Viernes 16:00", n: 53, entradas: 28 },
    // Sábado 26-sep: sin clase (confirmado). entradas=0 en las 9 franjas -> el día queda
    // fuera de "medibles" (slotsSinClase), igual que en producción.
    { slot_id: "backend-sábado-08-avanzado", fecha: "2026-09-26", cuenta_zoom: "soporte", horario_texto: "Sábado 08:00 Avanzado", n: 55, entradas: 0 },
    { slot_id: "backend-sábado-08-dos", fecha: "2026-09-26", cuenta_zoom: "jovenescreativos", horario_texto: "Sábado 08:00 Dos", n: 52, entradas: 0 },
    { slot_id: "backend-sábado-08-uno", fecha: "2026-09-26", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 08:00 Uno", n: 50, entradas: 0 },
    { slot_id: "backend-sábado-10", fecha: "2026-09-26", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 10:00", n: 52, entradas: 0 },
    { slot_id: "backend-sábado-10-avanzado", fecha: "2026-09-26", cuenta_zoom: "soporte", horario_texto: "Sábado 10:00 Avanzado", n: 50, entradas: 0 },
    { slot_id: "backend-sábado-14-avanzado", fecha: "2026-09-26", cuenta_zoom: "soporte", horario_texto: "Sábado 14:00 Avanzado", n: 46, entradas: 0 },
    { slot_id: "backend-sábado-14-uno", fecha: "2026-09-26", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 14:00 Uno", n: 52, entradas: 0 },
    { slot_id: "backend-sábado-16-avanzado", fecha: "2026-09-26", cuenta_zoom: "soporte", horario_texto: "Sábado 16:00 Avanzado", n: 57, entradas: 0 },
    { slot_id: "backend-sábado-16-uno", fecha: "2026-09-26", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 16:00 Uno", n: 54, entradas: 0 },
  ],
};

// Total real de "asistieron" (personas únicas del roster con >=1 entrada), tomado de
// lib/historico-demo.mjs para la misma semana. La suma cruda de `entradas` por franja no
// coincide 1 a 1 con este número (incluye visitas de otras franjas/personas repetidas entre
// sesiones), así que se reparte proporcionalmente por franja con redondeo de mayor resto para
// que la suma dé EXACTO el total real, en vez de aproximar y arriesgar que no cuadre.
const ASISTIERON_REAL = { "2026-09-14": 541, "2026-09-21": 172 };

function repartirMayorResto(pesos, total) {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos === 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (p * total) / sumaPesos);
  const base = exactos.map(Math.floor);
  let faltante = total - base.reduce((a, b) => a + b, 0);
  const orden = exactos.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < orden.length && faltante > 0; k += 1, faltante -= 1) base[orden[k][1]] += 1;
  return base;
}

function asignarAsistieron(medibles, total) {
  // `entradas` reales puede superar `n` (visitas de otra franja se suman a las entradas
  // crudas de una sala), así que el reparto proporcional se topa a `n` por franja y lo que
  // sobra se reasigna a franjas con cupo libre, hasta agotar el total exacto.
  const reparto = repartirMayorResto(medibles.map((s) => s.entradas), total);
  const asignado = medibles.map((s, i) => Math.min(reparto[i], s.n));
  let faltante = total - asignado.reduce((a, b) => a + b, 0);
  for (let i = 0; faltante > 0 && i < medibles.length; i += 1) {
    const cupo = medibles[i].n - asignado[i];
    if (cupo <= 0) continue;
    const usar = Math.min(cupo, faltante);
    asignado[i] += usar;
    faltante -= usar;
  }
  return new Map(medibles.map((s, i) => [s.slot_id, asignado[i]]));
}

function generarSemana(semana) {
  const slots = SLOTS[semana];
  const medibles = slots.filter((s) => s.entradas > 0); // mismas franjas que cuentan como "activas"
  const asistieronPorSlotId = asignarAsistieron(medibles, ASISTIERON_REAL[semana]);

  const roster = [], franjas = [], sesiones = [], entradas = [], celdas = [];
  let contador = 0;
  for (const slot of slots) {
    franjas.push({ slot_id: slot.slot_id, fecha: slot.fecha, cuenta_zoom: slot.cuenta_zoom, horario_texto: slot.horario_texto });
    const sesionId = `demo-${semana}-${slot.slot_id}`;
    sesiones.push({ sesion_id: sesionId, slot_id: slot.slot_id, fecha: slot.fecha,
      estado_captura: slot.entradas > 0 ? "capturada" : "sin_captura", entradas_totales: slot.entradas });
    const entranEnEsteSlot = asistieronPorSlotId.get(slot.slot_id) ?? 0;
    for (let i = 0; i < slot.n; i += 1) {
      contador += 1;
      const personaId = `demo-${semana}-${contador}`;
      const ciudad = CIUDADES[contador % CIUDADES.length];
      const entro = i < entranEnEsteSlot;
      roster.push({ persona_id: personaId, nombre: `Persona Demo ${String(contador).padStart(3, "0")}`, ciudad, slot_id: slot.slot_id });
      celdas.push({ persona_id: personaId, estado: entro ? "SI" : "NO" });
      if (entro) entradas.push({ persona_id: personaId, sesion_id: sesionId });
    }
  }
  return { roster, franjas, sesiones, entradas, celdas };
}

export const DETALLE_DEMO_BASE = {
  "2026-09-14": generarSemana("2026-09-14"),
  "2026-09-21": generarSemana("2026-09-21"),
};
