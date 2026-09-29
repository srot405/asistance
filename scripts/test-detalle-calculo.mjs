import assert from "node:assert/strict";
import { calcularDetalleSemana, construirBase, listarAusentesDesdeBase, SEMANAS_DETALLE } from "../lib/detalleCalculo.mjs";
import { construirCsvNominal } from "../lib/exportarNominal.mjs";

// Semana sintética: 2 franjas (martes Bogotá/comunicaciones, miércoles
// Medellín/soporte) + un slot "sábado" sin ninguna sesión con entradas (día no
// ocurrido: debe caer en sin_clase, nunca contar como ausencia) + una persona
// pendiente (celda "P") y otra sin celda registrada (sin_dato).
const roster = [
  { persona_id: "p1", nombre: "Ana Uno", ciudad: "Bogotá", slot_id: "martes" },
  { persona_id: "p2", nombre: "Beto Dos", ciudad: "Bogotá", slot_id: "martes" },
  { persona_id: "p3", nombre: "Caro Tres", ciudad: "Medellín", slot_id: "miercoles" },
  { persona_id: "p4", nombre: "Dani Cuatro", ciudad: "Medellín", slot_id: "miercoles" },
  { persona_id: "p5", nombre: "Eva Cinco", ciudad: "Bogotá", slot_id: "sabado" },
  { persona_id: "p6", nombre: "Fabio Seis", ciudad: "Bogotá", slot_id: "martes" },
  { persona_id: "p7", nombre: "Gina Siete", ciudad: "Bogotá", slot_id: "martes" },
];
const franjas = [
  { slot_id: "martes", fecha: "2026-09-15", cuenta_zoom: "comunicaciones", horario_texto: "Martes 18:00" },
  { slot_id: "miercoles", fecha: "2026-09-16", cuenta_zoom: "soporte", horario_texto: "Miércoles 18:00" },
  { slot_id: "sabado", fecha: "2026-09-19", cuenta_zoom: "comunicaciones", horario_texto: "Sábado 08:00" },
];
const sesiones = [
  { sesion_id: "s-martes", slot_id: "martes", fecha: "2026-09-15", entradas_totales: 2 },
  { sesion_id: "s-miercoles", slot_id: "miercoles", fecha: "2026-09-16", entradas_totales: 1 },
  { sesion_id: "s-sabado", slot_id: "sabado", fecha: "2026-09-19", entradas_totales: 0 },
];
const entradas = [
  { persona_id: "p1", sesion_id: "s-martes" },
  { persona_id: "p3", sesion_id: "s-miercoles" },
];
const celdas = [
  { persona_id: "p1", estado: "SI" }, { persona_id: "p2", estado: "NO" },
  { persona_id: "p3", estado: "SI" }, { persona_id: "p4", estado: "NO?" },
  { persona_id: "p6", estado: "P" },
  // p5 (slot sin clase) y p7 quedan sin celda -> sin_dato/sin_clase.
];
const base = construirBase(roster, franjas, sesiones, entradas, celdas);

// sábado no tuvo ninguna sesión con entradas: su única persona (p5) cae en
// sin_clase, nunca en ausencia, y el slot no aparece en porDia/porClase.
const resultado = calcularDetalleSemana("2026-09-14", base);
assert.equal(resultado.nivel, "Detalle");
assert.deepEqual(resultado.ciudades, ["Bogotá", "Medellín"]);
assert.deepEqual(resultado.cuentas, ["comunicaciones", "soporte"]);
assert.equal(resultado.resumen.poblacion, 4, "p6 pendiente y p7 sin_dato quedan fuera de lo medible");
assert.equal(resultado.resumen.asistieron, 2);
assert.equal(resultado.resumen.nunca, 2);
assert.equal(resultado.porDia.some((d) => d.fecha === "2026-09-19"), false, "sábado sin actividad no genera fila");
assert.deepEqual(resultado.porDia.map((d) => d.fecha), ["2026-09-15", "2026-09-16"]);
const diaMartes = resultado.porDia.find((d) => d.fecha === "2026-09-15");
assert.equal(diaMartes.poblacion, 2, "solo p1 y p2 son medibles ese día (p6=pendiente, p7=sin_dato)");
assert.equal(diaMartes.asistieron, 1);

// Filtro por ciudad: Medellín deja fuera todo el slot martes.
const soloMedellin = calcularDetalleSemana("2026-09-14", base, { ciudad: "Medellín" });
assert.equal(soloMedellin.resumen.poblacion, 2);
assert.equal(soloMedellin.resumen.asistieron, 1);
assert.deepEqual(soloMedellin.porClase.map((c) => c.slot_id), ["miercoles"]);

// Filtro por franja y por cuenta_zoom.
const soloMartes = calcularDetalleSemana("2026-09-14", base, { franja: "martes" });
assert.equal(soloMartes.resumen.poblacion, 2);
const soloSoporte = calcularDetalleSemana("2026-09-14", base, { cuenta: "soporte" });
assert.equal(soloSoporte.resumen.poblacion, 2);
assert.equal(soloSoporte.resumen.asistieron, 1);

// Nominal: quién no ingresó (semana completa) -- p2 nunca entró y es medible;
// p6 (pendiente) y p7 (sin_dato) NUNCA deben aparecer como ausentes.
const ausentesSemana = listarAusentesDesdeBase(base, {});
assert.deepEqual(ausentesSemana.map((a) => a.nombre), ["Beto Dos", "Dani Cuatro"]);
for (const nombre of ausentesSemana.map((a) => a.nombre))
  assert.ok(!["Fabio Seis", "Gina Siete", "Eva Cinco"].includes(nombre), `${nombre} no debe estar en el nominal`);

// Nominal por día: p4 entró el miércoles, así que el día miércoles solo deja a nadie fuera... probamos martes.
const ausentesMartes = listarAusentesDesdeBase(base, { fecha: "2026-09-15" });
assert.deepEqual(ausentesMartes.map((a) => a.nombre), ["Beto Dos"]);

// El CSV nominal nunca debe traer cédula ni correo -- solo lo que listarAusentesDesdeBase expone.
const csv = construirCsvNominal(ausentesSemana, "semana");
assert.match(csv.contenido.split("\r\n")[0], /"nombre","ciudad","franja","fecha"/);
assert.doesNotMatch(csv.contenido, /correo|cedula|cédula/i);
assert.equal(csv.archivo, "no_ingresaron_semana");
assert.throws(() => construirCsvNominal([], "mes"), RangeError);

assert.equal(SEMANAS_DETALLE.has("2026-09-14"), true);
assert.equal(SEMANAS_DETALLE.has("2026-08-31"), false, "Solo semanal no tiene roster nominal");

console.log("RESUMEN: detalle_calculo=filtros_ciudad_franja_cuenta nominal=dia_y_semana sin_clase=excluido pendiente=excluido estado=verde");
