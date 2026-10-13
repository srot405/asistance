import assert from "node:assert/strict";
import { calcularDetalleSemana, construirBase } from "../lib/detalleCalculo.mjs";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";
import {
  barrasDia, coladosProvisionales, marcasEje, maximoDia, puntosSemana, SERIES_POR_MODO, semanaAbierta, techoEje, valorPunto,
} from "../lib/graficasCalendario.mjs";

let casos = 0;
const caso = (nombre, fn) => { fn(); casos += 1; };

// Series según filtro: horario / solo colados / sumados (+ total).
caso("series", () => {
  assert.deepEqual(SERIES_POR_MODO.horario, ["horario"]);
  assert.deepEqual(SERIES_POR_MODO.colados, ["colados"]);
  assert.deepEqual(SERIES_POR_MODO.ambos, ["horario", "colados", "ambos"]);
});

// Semana abierta: cerrada_en null = abierta; fecha = cerrada salvo clase en curso; ausente = solo en_curso.
caso("semana abierta", () => {
  assert.equal(semanaAbierta(null, { en_curso: false }), true);
  assert.equal(semanaAbierta("2026-10-04T23:00:00Z", { en_curso: false }), false);
  assert.equal(semanaAbierta("2026-10-04T23:00:00Z", { en_curso: true }), true);
  assert.equal(semanaAbierta(undefined, { en_curso: false }), false);
  assert.equal(semanaAbierta(undefined, null), false);
  assert.equal(coladosProvisionales("horario", true), false, "sin colados a la vista no hay trama");
  assert.equal(coladosProvisionales("colados", true), true);
  assert.equal(coladosProvisionales("ambos", false), false, "semana cerrada = sólido");
});

// Sintético: puntos = porDia tal cual; un campo ausente es null (nunca 0).
const porDia = [
  { fecha: "2026-09-29", poblacion: 50, asistieron: 40, nunca: 10, porcentaje_retencion: 80, porcentaje_nunca: 20,
    horario: 30, colados: 10, ambos: 40, porcentaje_horario: 60, porcentaje_colados: 20, porcentaje_ambos: 80 },
  { fecha: "2026-09-30", poblacion: 20, asistieron: 5, nunca: 15, porcentaje_retencion: 25, porcentaje_nunca: 75, en_curso: true },
];
caso("puntos semana", () => {
  const p = puntosSemana(porDia);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].horario, p[0].colados, p[0].ambos], [30, 10, 40]);
  assert.equal(p[1].horario, null, "sin dato no se dibuja como 0");
  assert.equal(p[1].en_curso, true);
  assert.equal(valorPunto(p[0], "horario"), 60, "la vista semana usa el % del día (porcentaje_horario)");
  assert.equal(valorPunto(p[0], "ambos"), 80);
  assert.equal(valorPunto(p[1], "colados"), null, "día en curso: sin % final, no se dibuja");
  assert.deepEqual(puntosSemana(undefined), []);
});

const porClase = [
  { fecha: "2026-10-03", slot_id: "a", poblacion: 50, asistieron: 45, nunca: 5, porcentaje_retencion: 90, porcentaje_nunca: 10, horario: 40, colados: 5, ambos: 45 },
  { fecha: "2026-10-03", slot_id: "b", poblacion: 30, asistieron: 12, nunca: 18, porcentaje_retencion: 40, porcentaje_nunca: 60, horario: 10, colados: 2, ambos: 12 },
  { fecha: "2026-10-01", slot_id: "c", poblacion: 9, asistieron: 9, nunca: 0, porcentaje_retencion: 100, porcentaje_nunca: 0, horario: 9, colados: 0, ambos: 9 },
];
caso("barras: apilado según filtro", () => {
  const ambos = barrasDia(porClase, "2026-10-03", "ambos");
  assert.deepEqual(ambos.map((b) => b.slot_id), ["a", "b"], "solo las clases de ese día");
  assert.deepEqual(ambos[0].segmentos, [{ tipo: "horario", desde: 0, hasta: 40 }, { tipo: "colados", desde: 40, hasta: 45 }]);
  assert.equal(ambos[0].visible, 45);
  const horario = barrasDia(porClase, "2026-10-03", "horario");
  assert.deepEqual(horario[1].segmentos, [{ tipo: "horario", desde: 0, hasta: 10 }]);
  const colados = barrasDia(porClase, "2026-10-03", "colados");
  assert.deepEqual(colados[0].segmentos, [{ tipo: "colados", desde: 0, hasta: 5 }], "solo colados arranca en la base");
  assert.equal(maximoDia(ambos), 50, "el fondo (roster) fija la escala");
});

caso("eje", () => {
  assert.equal(techoEje(0), 1);
  assert.equal(techoEje(47), 50);
  assert.equal(techoEje(51), 60);
  assert.equal(techoEje(57), 60);
  assert.equal(techoEje(180), 200);
  assert.equal(techoEje(220), 250);
  assert.deepEqual(marcasEje(100), [0, 25, 50, 75, 100]);
});

// Cuadre con el cálculo real (fixture demo): cada punto/barra = la cifra de porDia/porClase, y horario + colados = ambos.
caso("cuadre demo", () => {
  for (const [semana, f] of Object.entries(DETALLE_DEMO_BASE)) {
    const detalle = calcularDetalleSemana(semana, construirBase(f.roster, f.franjas, f.sesiones, f.entradas, f.celdas));
    assert.ok(detalle.porDia.length > 0, `${semana}: el demo tiene días`);
    const puntos = puntosSemana(detalle.porDia);
    detalle.porDia.forEach((d, i) => {
      if (!d.en_curso) assert.equal(valorPunto(puntos[i], "colados"), d.porcentaje_colados);
      assert.equal(puntos[i].horario, d.horario); assert.equal(puntos[i].colados, d.colados); assert.equal(puntos[i].ambos, d.ambos);
      assert.equal(d.horario + d.colados, d.ambos, `${semana} ${d.fecha}: horario + colados = ambos`);
      const barras = barrasDia(detalle.porClase, d.fecha, "ambos");
      assert.equal(barras.reduce((s, b) => s + b.visible, 0), d.ambos, `${semana} ${d.fecha}: barras suman el día`);
      assert.equal(barras.reduce((s, b) => s + b.poblacion, 0), d.poblacion, `${semana} ${d.fecha}: fondos suman el roster del día`);
    });
  }
});

// Sin PII: lo que sale del helper no lleva nombres ni cédulas.
caso("sin pii", () => {
  const claves = new Set([...puntosSemana(porDia), ...barrasDia(porClase, "2026-10-03", "ambos")].flatMap(Object.keys));
  for (const prohibida of ["nombre", "cedula", "persona_id", "correo"]) assert.ok(!claves.has(prohibida));
});

console.log(`RESUMEN: tests=graficas-calendario casos=${casos} estado=verde`);
