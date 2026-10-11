import assert from "node:assert/strict";
import { asistioEnSemana, calcularDetalleSemana, construirBase, listarAusentesDesdeBase, slotsEnCurso } from "../lib/detalleCalculo.mjs";
import { estadoPresenciaOficial } from "../lib/presenciaTiempo.mjs";

// Fases 1.2 / 1.3 / 1.7 del plan de veracidad (2026-10-09): UNA regla de "asistio" (= horario + colados de la semana,
// contado en el dia de SU clase), "No ingresaron" como su complemento exacto, y clases en curso sin % artificial.
const franjas = [
  { slot_id: "mar", fecha: "2026-10-06", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00" },
  { slot_id: "mie", fecha: "2026-10-07", cuenta_zoom: "soporte", horario_texto: "Miércoles 18:00" },
  { slot_id: "vie", fecha: "2026-10-09", cuenta_zoom: "soporte", horario_texto: "Viernes 16:00" },
  { slot_id: "sab", fecha: "2026-10-10", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 08:00" },
];
const sesiones = [
  { sesion_id: "s-mar", slot_id: "mar", fecha: "2026-10-06", entradas_totales: 9, estado_captura: "capturada" },
  { sesion_id: "s-mie", slot_id: "mie", fecha: "2026-10-07", entradas_totales: 9, estado_captura: "capturada" },
  // Sesion sin slot_id (sala sin franja): quien entra ahi tambien "entro a otra clase".
  { sesion_id: "s-suelta", slot_id: null, fecha: "2026-10-07", entradas_totales: 1, estado_captura: "capturada" },
  { sesion_id: "s-vie", slot_id: "vie", fecha: "2026-10-09", entradas_totales: 2, estado_captura: "en_curso" },
  { sesion_id: "s-sab", slot_id: "sab", fecha: "2026-10-10", entradas_totales: 0, estado_captura: "por_ocurrir" },
];
const roster = [
  { persona_id: "1", nombre: "Uno", ciudad: "Cali", slot_id: "mar" },     // horario
  { persona_id: "2", nombre: "Dos", ciudad: "Cali", slot_id: "mar" },     // colado otro DIA (miercoles): antes salia en "No ingresaron" del martes
  { persona_id: "3", nombre: "Tres", ciudad: "Bogotá", slot_id: "mar" },  // no entro
  { persona_id: "4", nombre: "Cuatro", ciudad: "Cali", slot_id: "mar" },  // solo a la sesion sin slot
  { persona_id: "5", nombre: "Cinco", ciudad: "Bogotá", slot_id: "mie" }, // horario
  { persona_id: "6", nombre: "Seis", ciudad: "Cali", slot_id: "mie" },    // no entro
  { persona_id: "7", nombre: "Siete", ciudad: "Cali", slot_id: "vie" },   // ya entro a la clase en curso
  { persona_id: "8", nombre: "Ocho", ciudad: "Cali", slot_id: "vie" },    // celda P: aun no se sabe
  { persona_id: "9", nombre: "Nueve", ciudad: "Cali", slot_id: "sab" },   // sabado no ocurrido: sin_clase
];
const entradas = [{ persona_id: "1", sesion_id: "s-mar" }, { persona_id: "2", sesion_id: "s-mie" }, { persona_id: "4", sesion_id: "s-suelta" },
  { persona_id: "5", sesion_id: "s-mie" }, { persona_id: "7", sesion_id: "s-vie" }];
const estado = { 1: "SI", 2: "NO", 3: "NO", 4: "NO", 5: "SI", 6: "NO?", 7: "SI", 8: "P", 9: "P" };
const celdas = roster.map((p) => ({ persona_id: p.persona_id, estado: estado[p.persona_id] }));
const base = construirBase(roster, franjas, sesiones, entradas, celdas);

function verificarInvariante(filtro) {
  const r = calcularDetalleSemana("2026-10-05", base, filtro);
  const filas = [["semana", r.resumen, listarAusentesDesdeBase(base, filtro).length],
    ...r.porDia.map((d) => [d.fecha, d, listarAusentesDesdeBase(base, { ...filtro, fecha: d.fecha }).length]),
    ...r.porClase.map((c) => [c.slot_id, c, listarAusentesDesdeBase(base, { ...filtro, franja: c.slot_id }).length])];
  for (const [quien, d, noIngresaron] of filas) {
    assert.equal(d.ambos + noIngresaron, d.poblacion, `${quien}: ambos + No ingresaron = medibles`);
    assert.equal(d.asistieron, d.ambos, `${quien}: asistieron = ambos (regla unica)`);
    assert.equal(d.asistieron + d.nunca, d.poblacion, `${quien}: asistieron + nunca = poblacion`);
    assert.equal(d.porcentaje_retencion, d.porcentaje_ambos, `${quien}: % retencion = % ambos`);
  }
  return r;
}
const r = verificarInvariante({});
for (const filtro of [{ ciudad: "Cali" }, { ciudad: "Bogotá" }, { cuenta: "soporte" }, { franja: "mar" }]) verificarInvariante(filtro);

// 1.2: el colado de otro dia (2) y quien entro a una sesion sin franja (4) ya NO salen como "No ingresaron" del martes.
assert.deepEqual(listarAusentesDesdeBase(base, { fecha: "2026-10-06" }).map((a) => a.nombre), ["Tres"]);
assert.deepEqual(listarAusentesDesdeBase(base, {}).map((a) => a.nombre), ["Seis", "Tres"]);
const mar = r.porDia.find((d) => d.fecha === "2026-10-06");
assert.deepEqual([mar.poblacion, mar.asistieron, mar.horario, mar.colados, mar.nunca], [4, 3, 1, 2, 1]);
assert.equal(asistioEnSemana(base, roster[3]), true, "sesion sin slot_id cuenta como colado");

// 1.3 Presencia: "Nunca entro" usa la misma regla; el colado (sin tiempo en su clase) queda sin_dato.
assert.equal(estadoPresenciaOficial(asistioEnSemana(base, roster[1]), undefined), "sin_dato");
assert.equal(estadoPresenciaOficial(asistioEnSemana(base, roster[2]), undefined), "nunca_entro");

// 1.7: viernes en curso (estado_captura en_curso y celda P) -> marcado; martes/miercoles cerrados no.
assert.deepEqual([...slotsEnCurso(base)], ["vie"], "sabado sin clase ocurrida no es 'en curso' (sus P son sin_clase)");
const vie = r.porDia.find((d) => d.fecha === "2026-10-09");
assert.equal(vie.en_curso, true); assert.equal(vie.poblacion, 1); assert.equal(vie.porcentaje_retencion, 100, "el 100 % artificial que la UI oculta");
assert.equal(r.porClase.find((c) => c.slot_id === "vie").en_curso, true);
assert.equal(mar.en_curso, false); assert.equal(r.resumen.en_curso, true);
assert.equal(calcularDetalleSemana("2026-10-05", base, { franja: "mar" }).resumen.en_curso, false, "el recorte sin la clase en curso no se marca");
// Segunda senal sola: celda P con la fecha ya activa, aunque la sesion diga capturada.
const soloP = construirBase(roster, franjas, sesiones.map((s) => (s.slot_id === "vie" ? { ...s, estado_captura: "capturada" } : s)), entradas, celdas);
assert.deepEqual([...slotsEnCurso(soloP)], ["vie"]);
const sinP = construirBase(roster, franjas, sesiones.map((s) => (s.slot_id === "vie" ? { ...s, estado_captura: "capturada" } : s)), entradas,
  celdas.map((c) => (c.persona_id === "8" ? { ...c, estado: "NO" } : c)));
assert.equal(slotsEnCurso(sinP).size, 0, "clase cerrada: sin marca");

console.log("RESUMEN: asistio=regla_unica_ambos no_ingresaron=complemento_exacto presencia=misma_regla en_curso=marcado estado=verde");
