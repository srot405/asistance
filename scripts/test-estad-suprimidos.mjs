// Fase 1.5: «Suprimidos (<5)» hace que roster = visible + suprimidos en cada corte (semana / dia / ciudad / ciudad_dia).
// Datos sinteticos: el demo suma ANTES de suprimir, asi que se conoce la verdad cruda de cada fila oculta.
import assert from "node:assert/strict";
import { ESTADISTICAS_DEMO, SERIE_DEMO } from "../lib/estadisticas-demo.mjs";
import * as E from "../lib/estadisticasCalculo.mjs";

const F = (o = {}) => ({ ...E.FILTROS_VACIOS, ...o });
let cortes = 0;
for (const semana of Object.keys(ESTADISTICAS_DEMO)) {
  const d = { disponible: true, semana, materia: "X", ...ESTADISTICAS_DEMO[semana], serie: SERIE_DEMO };
  const op = E.opcionesFiltros(d);
  const filtros = [F(), ...op.ciudades.map((ciudad) => F({ ciudad })), ...op.dias.map((dia) => F({ dia })),
    ...op.ciudades.flatMap((ciudad) => op.dias.map((dia) => F({ ciudad, dia })))];
  for (const f of filtros) {
    const s = E.suprimidosDelCorte(d, f);
    const total = E.cifrasDelCorte(d, f);
    if (total.fuente !== "nivel" || total.suprimido) { assert.equal(s.aplica, false); continue; }
    assert.equal(s.aplica, true);
    assert.equal(s.visible + s.suprimidos, total.cifras.roster, `cuadra ${semana} ${JSON.stringify(f)}`);
    assert.ok(s.coherente, "cada fila oculta aporta 1..4");
    const ocultas = E.filtrarClases(d.clases, f).filter((c) => c.suprimido).length;
    assert.equal(s.filas_suprimidas, ocultas);
    if (ocultas === 0) assert.equal(s.suprimidos, 0, "sin filas ocultas no hay suprimidos");
    cortes++;
  }
}
// La semana demo con Quibdo tiene filas suprimidas: el agregado es > 0
{
  const d = { disponible: true, semana: "2026-09-14", materia: "X", ...ESTADISTICAS_DEMO["2026-09-14"], serie: SERIE_DEMO };
  const s = E.suprimidosDelCorte(d, F());
  assert.ok(s.suprimidos > 0 && s.filas_suprimidas > 0);
  const csv = E.construirCsvEstadisticas(d, F()).contenido;
  assert.ok(csv.includes(`roster ${s.roster} = ${s.visible} visibles + ${s.suprimidos} suprimidos`), "el CSV trae la fila SUPRIMIDOS");
  assert.equal(E.suprimidosDelCorte(d, F({ cuenta: "soporte" })).aplica, false, "con filtro de clase no hay total publicado que cuadrar");
}
// Descuadre de datos: si la resta no corresponde a filas <5, se marca (no se esconde)
{
  const d = { disponible: true, semana: "s", materia: "X", serie: [],
    niveles: [{ semana: "s", nivel: "semana", ciudad: null, dia: null, materia: "X", suprimido: false, roster: 40, entraron_a_su_clase: 0, fueron_a_otra: 0, no_aparecieron: 0, no_medibles: 0, visitas_recibidas: 0 }],
    clases: [{ ciudad: "A", slot_id: "a", dia: "lunes", suprimido: false, roster: 20 }, { ciudad: "B", slot_id: "a", dia: "lunes", suprimido: true, roster: null }] };
  const s = E.suprimidosDelCorte(d, F());
  assert.equal(s.suprimidos, 20); assert.equal(s.coherente, false);
}
console.log(`RESUMEN: estad_suprimidos cortes=${cortes} roster=visible+suprimidos estado=verde`);
