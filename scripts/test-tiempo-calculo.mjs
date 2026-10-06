import assert from "node:assert/strict";
import { armarSerieTiempo, armarTiempoSemana, compararConBackend, cuantil, normalizarClaseBackend, normalizarResumenPersonas, percentiles } from "../lib/tiempoCalculo.mjs";
import { porcentajeCumple } from "../lib/tiempoVista.mjs";

// --- percentiles = referencia (clasificar.py::cuantil / tiempo_asistencia.py::resumen_clase) ---
const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
assert.equal(cuantil(v, 0.5), 55);
assert.equal(cuantil(v, 0.1), 19);
assert.equal(cuantil(v, 0.9), 91);
assert.deepEqual(percentiles(v), { mediana: 55, p10: 19, p90: 91 });
assert.deepEqual(percentiles([10, 20, 30, 40]), { mediana: null, p10: null, p90: null }, "n<5 => null (k-anonimato)");
assert.deepEqual(percentiles([10, 20, 30, 40, 50]), { mediana: 30, p10: 14, p90: 46 });

// --- fixtures sinteticos (sin PII) ---
const franjas = [
  { slot_id: "a-1", fecha: "2099-01-05", cuenta_zoom: "x", horario_texto: "Lunes A" },
  { slot_id: "b-2", fecha: "2099-01-05", cuenta_zoom: "y", horario_texto: "Lunes B" },
  { slot_id: "c-3", fecha: "2099-01-06", cuenta_zoom: "x", horario_texto: "Martes C" },
  { slot_id: "d-4", fecha: "2099-01-06", cuenta_zoom: "x", horario_texto: "Martes D (sin ingresos)" },
];
const fila = (slot, estado, pct, extra = {}) => ({
  sesion_id: `2099-01-05|${slot}`, slot_id: slot, fecha: franjas.find((f) => f.slot_id === slot).fecha, es_visita: false, franja_propia: slot,
  ciudad: "Ciudad X", estado_tiempo: estado, cumple_50: estado === "cumple" ? true : estado === "rojo_tiempo" ? false : null,
  motivo: estado === "sin_dato_tiempo" ? "sin_medicion" : null, pct_tiempo: pct, segundos: pct == null ? null : Math.round(pct * 72), ...extra,
});
const personas = [
  // a-1: 5 personas con 90 % (todas cumplen)
  ...[90, 90, 90, 90, 90].map((p) => fila("a-1", "cumple", p)),
  // b-2: 10 personas con 10 % (todas rojo), ciudad Y
  ...Array.from({ length: 10 }, () => fila("b-2", "rojo_tiempo", 10, { ciudad: "Ciudad Y" })),
  // c-3: clase ENTERA sin medicion (3 ingresaron, ninguna medida)
  ...Array.from({ length: 3 }, () => fila("c-3", "sin_dato_tiempo", null)),
  // visita a a-1 de alguien de b-2 (no entra a los conteos de a-1)
  fila("a-1", "rojo_tiempo", 20, { es_visita: true, franja_propia: "b-2", ciudad: "Ciudad Y" }),
];
const clases = [
  { sesion_id: "2099-01-05|a-1", slot_id: "a-1", fecha: "2099-01-05", estado_captura: "capturada", roster_n: 8, ingresaron_propios: 5, visitas: 1, visitas_cumplen: 0, visitas_rojo: 1, visitas_sin_dato: 0,
    n_medibles: 5, n_cumplen: 5, n_rojo: 0, n_sin_dato: 0, n_pendiente: 0, mediana_pct: 90, p10_pct: 90, p90_pct: 90, hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 5], fin_clase_min: 120, fin_confiable: true, clase_evaluable: true },
  { sesion_id: "2099-01-05|b-2", slot_id: "b-2", fecha: "2099-01-05", estado_captura: "capturada", roster_n: 12, ingresaron_propios: 10, visitas: 0, visitas_cumplen: 0, visitas_rojo: 0, visitas_sin_dato: 0,
    n_medibles: 10, n_cumplen: 0, n_rojo: 10, n_sin_dato: 0, n_pendiente: 0, mediana_pct: 10, p10_pct: 10, p90_pct: 10, hist: [0, 10, 0, 0, 0, 0, 0, 0, 0, 0], fin_clase_min: 120, fin_confiable: true, clase_evaluable: true },
  { sesion_id: "2099-01-06|c-3", slot_id: "c-3", fecha: "2099-01-06", estado_captura: "capturada", roster_n: 5, ingresaron_propios: 3, visitas: 0, visitas_cumplen: 0, visitas_rojo: 0, visitas_sin_dato: 0,
    n_medibles: 0, n_cumplen: 0, n_rojo: 0, n_sin_dato: 3, n_pendiente: 0, mediana_pct: null, p10_pct: null, p90_pct: null, hist: null, fin_clase_min: null, fin_confiable: false, clase_evaluable: false, motivo_no_evaluable: "sin_medicion" },
  { sesion_id: "2099-01-06|d-4", slot_id: "d-4", fecha: "2099-01-06", estado_captura: "por_ocurrir", roster_n: 4, ingresaron_propios: 0, visitas: 0, visitas_cumplen: 0, visitas_rojo: 0, visitas_sin_dato: 0,
    n_medibles: 0, n_cumplen: 0, n_rojo: 0, n_sin_dato: 0, n_pendiente: 0, fin_clase_min: null, fin_confiable: false, clase_evaluable: false, motivo_no_evaluable: "pendiente" },
];
// la fila de la clase c-3 usa su propia sesion_id en las personas
for (const p of personas) if (p.slot_id === "c-3") p.sesion_id = "2099-01-06|c-3";
const info = { semana: "2099-01-05", roster: 29, congelada_en: "2099-01-05T12:00:00Z", provisional: false };
const r = armarTiempoSemana({ clases, personas, franjas, info });

const porSlot = Object.fromEntries(r.por_clase.map((c) => [c.slot_id, c]));
// semana = suma de clases (pooled), no promedio
const sem = r.semana_agregada;
assert.equal(sem.n_ingresaron, 18);
assert.equal(sem.n_medibles, 15);
assert.equal(sem.n_cumplen, 5);
assert.equal(sem.n_rojo, 10);
assert.equal(sem.n_sin_dato, 3);
assert.equal(sem.roster, 29);
// semana = pool de personas, NO mediana de medianas (90 y 10 darian 50): 5x90 + 10x10 -> mediana 10
assert.equal(sem.mediana, 10);
assert.notEqual(sem.mediana, (porSlot["a-1"].mediana + porSlot["b-2"].mediana) / 2);
assert.equal(r.histograma.total, 15);
assert.equal(r.histograma.bins[9].n, 5);
assert.equal(r.histograma.bins[1].n, 10);
// clase ENTERA sin medicion: n_medibles=0, % null (no 0), sin_medicion
assert.equal(porSlot["c-3"].n_medibles, 0);
assert.equal(porcentajeCumple(porSlot["c-3"]), null);
assert.equal(porSlot["c-3"].sin_medicion, true);
assert.equal(porSlot["c-3"].mediana, null);
// cobertura 0 / sin ingresos
assert.equal(porSlot["d-4"].sin_ingresos, true);
assert.equal(porSlot["d-4"].cobertura, null);
assert.equal(porSlot["d-4"].nivel_cobertura, "sin_dato");
// n<5 => sin mediana ni histograma publicados
assert.equal(porSlot["a-1"].mediana, 90, "5 medidos si publica");
const poco = armarTiempoSemana({ clases: [{ ...clases[2], n_medibles: 2, n_cumplen: 2, n_sin_dato: 1, ingresaron_propios: 3, mediana_pct: 80 }],
  personas: [fila("c-3", "cumple", 80), fila("c-3", "cumple", 90), fila("c-3", "sin_dato_tiempo", null)].map((p) => ({ ...p, sesion_id: "2099-01-06|c-3" })), franjas, info });
assert.equal(poco.por_clase[0].mediana, null, "n<5: mediana suprimida aunque el backend la mande");
assert.equal(poco.histograma, null);
assert.equal(poco.por_clase[0].muestra_pequena, true);
// visitas aparte: no suman a los conteos
assert.equal(porSlot["a-1"].n_ingresaron, 5);
assert.equal(porSlot["a-1"].visitas, 1);
assert.deepEqual(r.visitas, { sesiones: 1, cumplen: 0, rojo: 1, sin_dato: 0 });
// por dia = suma de clases del dia
assert.equal(r.por_dia.length, 2);
assert.equal(r.por_dia[0].n_ingresaron, 15);
assert.equal(r.por_dia[1].n_ingresaron, 3);
// cuadre interno y contra backend: OK
assert.equal(r.cuadre.ok, true, r.cuadre.errores.join("|"));
assert.equal(r.cuadre_backend.estado, "OK", r.cuadre_backend.detalle.join("|"));
assert.deepEqual(r.ciudades, ["Ciudad X", "Ciudad Y"]);
assert.equal(r.hay_tiempos, true);

// filtro por ciudad (franja PROPIA): solo b-2 (Ciudad Y) y su visita a a-1
const f = armarTiempoSemana({ clases, personas, franjas, filtro: { ciudad: "Ciudad Y" }, info });
const fs = Object.fromEntries(f.por_clase.map((c) => [c.slot_id, c]));
assert.equal(f.semana_agregada.n_ingresaron, 10);
assert.equal(fs["b-2"].n_rojo, 10);
assert.equal(fs["a-1"].n_ingresaron, 0, "los propios de a-1 son de Ciudad X");
assert.equal(fs["a-1"].visitas, 1, "pero la visita (de Ciudad Y) sigue contando aparte");
assert.equal(f.cuadre_backend.estado, "SIN_COMPARAR");
assert.equal(f.semana_agregada.roster, null, "con filtro no se afirma un roster");
// filtro por cuenta
const fc = armarTiempoSemana({ clases, personas, franjas, filtro: { cuenta: "y" }, info });
assert.deepEqual(fc.por_clase.map((c) => c.slot_id).sort(), ["a-1", "b-2"], "b-2 por cuenta y a-1 por la visita");
assert.equal(fc.semana_agregada.n_ingresaron, 10);

// compararConBackend: una diferencia -> DISCREPA
const alterada = clases.map((c, i) => (i === 1 ? { ...c, n_rojo: 9, n_medibles: 9 } : c)).map(normalizarClaseBackend);
const cmp = compararConBackend(personas, alterada);
assert.equal(cmp.estado, "DISCREPA");
assert.ok(cmp.detalle.some((d) => d.startsWith("b-2.n_rojo")));
assert.equal(compararConBackend(personas, []).estado, "SIN_COMPARAR");
// el backend dice que ingresaron pero no llegaron filas por persona (lectura truncada) -> DISCREPA
assert.equal(armarTiempoSemana({ clases, personas: [], franjas, info }).cuadre_backend.estado, "DISCREPA");

// semana sin clases => hay_tiempos false y nada de 0 %
const vacia = armarTiempoSemana({ clases: [], personas: [], franjas, info });
assert.equal(vacia.hay_tiempos, false);
assert.equal(porcentajeCumple(vacia.semana_agregada), null);
assert.equal(vacia.histograma, null);

// resumen semanal por persona (MEJOR sesion) y serie
assert.equal(normalizarResumenPersonas(null), null);
assert.equal(normalizarResumenPersonas({ tiempo_roster: null }), null);
assert.equal(normalizarResumenPersonas({ tiempo_roster: 9, tiempo_cumplen: 5, tiempo_rojo: 1, tiempo_sin_dato: 1, tiempo_ausentes: 2, tiempo_sin_clase: 0,
  tiempo_pendientes: 0, tiempo_con_entrada: 7, tiempo_medidos: 6, tiempo_cobertura: "85.71", tiempo_definitivo: true }).cobertura, 85.71);
const serie = armarSerieTiempo([
  { semana: "2099-01-12", n_ingresaron: "10", n_medibles: "0", n_cumplen: 0, n_rojo: 0, n_sin_dato: 10, n_pendiente: 0, provisional: true, roster_franjas: 20 },
  { semana: "2099-01-05", n_ingresaron: 20, n_medibles: 10, n_cumplen: 8, n_rojo: 2, n_sin_dato: 10, n_pendiente: 0, provisional: false, roster_franjas: 30, tiempo_roster: 28 }]);
assert.deepEqual(serie.map((s) => s.semana), ["2099-01-05", "2099-01-12"], "orden cronologico");
assert.equal(serie[0].roster, 28);
assert.equal(serie[0].cobertura, 0.5);
assert.equal(serie[1].n_ingresaron, 10, "numeros como texto se convierten");
console.log("RESUMEN: tiempo_calculo=ok percentiles_ref=ok pool_no_mediana_de_medianas=ok clase_sin_medicion=null cobertura_0=ok n_menor_5=suprimido filtro=ok visitas_aparte=ok estado=verde");
