import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { armarTiempoSemana } from "../lib/tiempoCalculo.mjs";

// Muestras AGREGADAS (sin PII) de semanas completas (09-14, 09-21 L-V, 09-28): conteos y deciles por franja del plan.
// El archivo vive junto al plan, fuera de este repo: si no esta, el test se omite explicitamente (no pasa en silencio).
const RUTA = new URL("../../plan_detalle/plan_codex/muestras/resultados_agregados.json", import.meta.url);
try { await access(RUTA); } catch {
  console.log("RESUMEN: tiempo_muestras=OMITIDO (no esta plan_detalle/plan_codex/muestras/resultados_agregados.json) estado=verde");
  process.exit(0);
}
const muestras = JSON.parse(await readFile(RUTA, "utf8"));
// Totales de RESUMEN_MUESTRAS.md (franjas confiables: cobertura >= 90 %)
const ESPERADO = { "2026-09-14": { rojo: 66, cumplen: 248 }, "2026-09-21": { rojo: 24, cumplen: 115 }, "2026-09-28": { rojo: 62, cumplen: 229 } };

for (const [semana, esperado] of Object.entries(ESPERADO)) {
  const franjas = [], clases = [], personas = [];
  for (const [slot, m] of Object.entries(muestras[semana]).filter(([, v]) => v.cobertura >= 0.9)) {
    franjas.push({ slot_id: slot, fecha: m.fecha, cuenta_zoom: "x", horario_texto: slot });
    const rojo = m.rojos.rel50, cumplen = m.cumplen50, sinDato = m.ingresaron - m.completo;
    clases.push({ sesion_id: `${semana}|${slot}`, slot_id: slot, fecha: m.fecha, estado_captura: "capturada", roster_n: m.roster, ingresaron_propios: m.ingresaron,
      visitas: 0, visitas_cumplen: 0, visitas_rojo: 0, visitas_sin_dato: 0, n_medibles: rojo + cumplen, n_cumplen: cumplen, n_rojo: rojo, n_sin_dato: sinDato,
      n_pendiente: 0, fin_confiable: m.fin_confiable, clase_evaluable: true });
    // un % por persona en el centro de su bin (hist de la muestra): bins 0-4 = rojo, 5-9 = cumple
    m.hist.forEach((n, i) => { for (let k = 0; k < n; k++) personas.push({ sesion_id: `${semana}|${slot}`, slot_id: slot, fecha: m.fecha, es_visita: false, franja_propia: slot,
      ciudad: "X", estado_tiempo: i < 5 ? "rojo_tiempo" : "cumple", cumple_50: i >= 5, motivo: null, pct_tiempo: i * 10 + 5, segundos: null }); });
    for (let k = 0; k < sinDato; k++) personas.push({ sesion_id: `${semana}|${slot}`, slot_id: slot, fecha: m.fecha, es_visita: false, franja_propia: slot,
      ciudad: "X", estado_tiempo: "sin_dato_tiempo", cumple_50: null, motivo: "no_medible", pct_tiempo: null, segundos: null });
  }
  const r = armarTiempoSemana({ clases, personas, franjas, info: { semana, roster: 0 } });
  assert.equal(r.semana_agregada.n_rojo, esperado.rojo, `${semana}: rojos`);
  assert.equal(r.semana_agregada.n_cumplen, esperado.cumplen, `${semana}: cumplen`);
  assert.equal(r.cuadre.ok, true, `${semana}: ${r.cuadre.errores.join("|")}`);
  assert.equal(r.cuadre_backend.estado, "OK", `${semana}: ${r.cuadre_backend.detalle.join("|")}`);
  // el histograma semanal es la suma de los hist de las franjas, bin a bin
  const suma = Array.from({ length: 10 }, (_, i) => Object.entries(muestras[semana]).filter(([, v]) => v.cobertura >= 0.9).reduce((a, [, v]) => a + v.hist[i], 0));
  assert.deepEqual(r.histograma.bins.map((b) => b.n), suma, `${semana}: histograma semanal = suma de franjas`);
  assert.equal(r.histograma.bins.slice(0, 5).reduce((a, b) => a + b.n, 0), esperado.rojo, `${semana}: bins < 50 % = rojos`);
}
console.log(`RESUMEN: tiempo_muestras=ok semanas=3 rojos_66_24_62=ok cumplen_248_115_229=ok histograma=suma_franjas estado=verde`);
