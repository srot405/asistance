// Verificacion con datos REALES de solo lectura (F3, TOC-140): pasa por las funciones del frontend el equivalente
// en memoria de las tablas 082 de la semana 2026-09-28 (volcado SIN PII: sin persona_id ni nombres) y comprueba que los
// agregados cuadran con el replay de F2. No toca Supabase. Uso:
//   node scripts/verificar-tiempo-reales.mjs <equivalente_082.json> [replay_regla_tiempo.json]
// A = directo desde asist_tiempos (filas propias y visitas, regla entera del 50 %); B = capa de veredicto de F2.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { armarTiempoSemana } from "../lib/tiempoCalculo.mjs";

const [, , ruta, rutaReplay] = process.argv;
if (!ruta) { console.error("Falta la ruta del JSON equivalente a las tablas 082"); process.exit(2); }
const d = JSON.parse(await readFile(ruta, "utf8"));
const info = { semana: d.semana, roster: null, provisional: d.estado_semana !== "cerrada" };

// Rojos por franja PROPIA (< 50 % del tiempo de su clase) de la muestra con API de 2026-09-28
const ROJOS = { "jueves-10": 1, "jueves-16-avanzado": 5, "miércoles-18": 12, "sábado-08-avanzado": 5, "sábado-08-dos": 5, "sábado-08-uno": 6,
  "sábado-10": 6, "sábado-10-avanzado": 7, "sábado-14-avanzado": 4, "sábado-14-uno": 9, "sábado-16-avanzado": 7, "sábado-16-uno": 12, "viernes-16": 11 };

// ---- A) directo desde asist_tiempos
const a = armarTiempoSemana({ clases: d.A.clases, personas: d.A.personas, franjas: d.franjas, info });
const rojoPorFranja = Object.fromEntries(a.por_clase.map((c) => [c.slot_id.replace("backend-", ""), c.n_rojo]));
assert.deepEqual(rojoPorFranja, ROJOS, "rojos por franja (filas propias < 50 %) = muestra con API");
assert.equal(a.semana_agregada.n_medibles, 431, "431 propias medibles");
assert.equal(a.semana_agregada.n_ingresaron, 431);
assert.equal(a.semana_agregada.visitas, 63, "63 visitas");
assert.equal(a.semana_agregada.n_rojo, 90);
assert.equal(a.cuadre.ok, true, a.cuadre.errores.join("|"));
assert.equal(a.cuadre_backend.estado, "OK", a.cuadre_backend.detalle.join("|"));
assert.equal(a.por_clase.length, 13, "13 de las 14 franjas tienen filas en asist_tiempos (martes-18 sin sala medida)");
assert.equal(a.histograma.total, 431);
assert.equal(a.histograma.bins.slice(0, 5).reduce((x, b) => x + b.n, 0), 90, "bins < 50 % = rojos");
assert.equal(a.histograma.bins.slice(5).reduce((x, b) => x + b.n, 0), 431 - 90);

// ---- B) capa de veredicto de F2 (lo que quedara en asist_tiempo_clase / persona_sesion)
const b = armarTiempoSemana({ clases: d.B.clases, personas: d.B.personas, franjas: d.franjas, info });
assert.equal(b.cuadre.ok, true, b.cuadre.errores.join("|"));
assert.equal(b.cuadre_backend.estado, "OK", b.cuadre_backend.detalle.join("|"));
let replayOk = "sin replay";
if (rutaReplay) {
  const r = JSON.parse(await readFile(rutaReplay, "utf8"));
  for (const c of b.por_clase) {
    const e = r.franjas[c.slot_id.replace("backend-", "")];
    assert.ok(e, `franja ${c.slot_id} en el replay`);
    assert.equal(c.n_ingresaron, e.ingresaron_propios);
    assert.equal(c.n_cumplen, e.n_cumplen);
    assert.equal(c.n_rojo, e.n_rojo);
    assert.equal(c.n_sin_dato, e.n_sin_dato);
    assert.equal(c.visitas, e.visitas);
    assert.equal(c.mediana, e.n_medibles >= 5 ? e.mediana_pct : null, `mediana de ${c.slot_id}`);
  }
  const t = b.semana_agregada;
  assert.equal(t.n_cumplen + t.n_rojo + t.n_sin_dato, t.n_ingresaron);
  assert.equal(b.por_clase.length, Object.keys(r.franjas).length);
  // veredicto semanal (MEJOR sesion) del replay: aparte, no se suma a los de clase
  assert.equal(r.resumen.cumplen + r.resumen.rojo + r.resumen.sin_dato + r.resumen.ausentes + r.resumen.sin_clase + r.resumen.pendientes, r.resumen.roster);
  replayOk = `coincide con ${Object.keys(r.franjas).length} franjas del replay`;
}
const s = b.semana_agregada;
console.log(`REAL semana=${d.semana} estado=${d.estado_semana}`);
console.log(`  A (asist_tiempos directo): propias_medibles=${a.semana_agregada.n_medibles} visitas=${a.semana_agregada.visitas} rojo_lt50=${a.semana_agregada.n_rojo} cumplen=${a.semana_agregada.n_cumplen} ` +
  `rojos_por_franja=${Object.values(ROJOS).join(",")} mediana=${a.semana_agregada.mediana} p10=${a.semana_agregada.p10} p90=${a.semana_agregada.p90} cuadre_backend=${a.cuadre_backend.estado}`);
console.log(`  B (capa F2): ingresaron=${s.n_ingresaron} medidos=${s.n_medibles} cumplen=${s.n_cumplen} rojo=${s.n_rojo} sin_dato=${s.n_sin_dato} ` +
  `visitas=${s.visitas} (cumplen ${s.visitas_cumplen}, rojo ${s.visitas_rojo}, sin_dato ${s.visitas_sin_dato}) cobertura=${s.cobertura == null ? "n/d" : (s.cobertura * 100).toFixed(1) + "%"} ` +
  `nivel=${s.nivel_cobertura} cuadre=${b.cuadre.ok ? "ok" : "ROJO"} cuadre_backend=${b.cuadre_backend.estado} replay=${replayOk}`);
console.log(`RESUMEN: tiempo_reales=ok propias_medibles=431 visitas=63 rojos_por_franja=muestra clases=${b.por_clase.length} estado=verde`);
