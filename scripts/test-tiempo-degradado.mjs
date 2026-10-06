import assert from "node:assert/strict";
import { estadoVistaTiempo, TEXTO_NO_DISPONIBLE } from "../lib/tiempoVista.mjs";
import { cargarLector } from "./test-tiempo-paginacion.mjs";

const { lector } = await cargarLector({});
// esTablaAusente reconoce los codigos de PostgREST/Postgres y sus mensajes
assert.equal(lector.esTablaAusente({ code: "PGRST205" }), true);
assert.equal(lector.esTablaAusente({ code: "42P01" }), true);
assert.equal(lector.esTablaAusente({ message: "Could not find the table 'public.asist_tiempo_clase' in the schema cache" }), true);
assert.equal(lector.esTablaAusente({ message: 'relation "x" does not exist' }), true);
assert.equal(lector.esTablaAusente({ code: "57P01", message: "terminating connection" }), false, "una caida de red NO es tabla ausente");
assert.equal(lector.esTablaAusente(null), false);

const ausente = { code: "PGRST205", message: "Could not find the table" };
// tabla ausente => { disponible:false } (no lanza), tambien para la serie
const a = await cargarLector({}, { asist_tiempo_clase: ausente });
assert.deepEqual(JSON.parse(JSON.stringify(await a.lector.leerTiempoSemana("2099-01-05"))), { disponible: false, motivo: "sin_tablas" });
const b = await cargarLector({}, { v_asist_tiempo_semana: ausente });
assert.deepEqual(JSON.parse(JSON.stringify(await b.lector.leerTiempoSemanas())), { disponible: false, motivo: "sin_tablas" });
// la vista de personas ausente (083 sin aplicar) con 082 aplicada tambien degrada
const c = await cargarLector({ asist_tiempo_clase: [{ sesion_id: "2099-01-05|x", slot_id: "x", fecha: "2099-01-05", ingresaron_propios: 1 }] }, { v_asist_tiempo_persona: { code: "42P01" } });
assert.equal((await c.lector.leerTiempoSemana("2099-01-05")).disponible, false);

// tabla existe y SIN filas de la semana => disponible, hay_tiempos:false, sin 0 % inventado, y sin leer la vista de personas (egress)
const vacio = await cargarLector({ asist_franjas: [{ slot_id: "x", fecha: "2099-01-05", cuenta_zoom: "c", horario_texto: "Lunes" }], asist_semanas: [{ estado: "abierta", congelada_en: null, cerrada_en: null, notas: null }] });
const rv = await vacio.lector.leerTiempoSemana("2099-01-05");
assert.equal(rv.disponible, true);
assert.equal(rv.hay_tiempos, false);
assert.equal(rv.provisional, true);
assert.equal(vacio.consultas.some((q) => q.tabla === "v_asist_tiempo_persona"), false, "sin clases no se lee la vista nominal");
assert.equal(estadoVistaTiempo(JSON.parse(JSON.stringify(rv))), "vacio");

// error de red => lanza (la ruta responde 503 sin detalle)
const red = await cargarLector({}, { asist_tiempo_clase: { code: "57P01", message: "terminating connection" } });
await assert.rejects(() => red.lector.leerTiempoSemana("2099-01-05"));
await assert.rejects(() => (async () => (await cargarLector({}, { v_asist_tiempo_semana: { message: "boom" } })).lector.leerTiempoSemanas())());

// El lector de agregados NUNCA pide nombre ni persona_id
const ok = await cargarLector({ asist_tiempo_clase: [{ sesion_id: "2099-01-05|x", slot_id: "x", fecha: "2099-01-05", ingresaron_propios: 1, n_medibles: 1, n_cumplen: 1 }],
  v_asist_tiempo_persona: [{ sesion_id: "2099-01-05|x", franja_tiempo: "x", fecha: "2099-01-05", es_visita: false, franja_propia: "x", ciudad: "C", estado_tiempo: "cumple", cumple_50: true, pct_tiempo: 80, segundos: 5760 }],
  asist_franjas: [{ slot_id: "x", fecha: "2099-01-05", cuenta_zoom: "c", horario_texto: "Lunes" }], asist_semanas: [{ estado: "cerrada" }], asist_semana_resumen: [{}] });
const r = await ok.lector.leerTiempoSemana("2099-01-05");
assert.equal(r.disponible, true);
assert.equal(r.provisional, false);
assert.equal(r.semana_agregada.n_cumplen, 1);
for (const q of ok.consultas) assert.doesNotMatch(q.columnas, /nombre|persona_id|correo|cedula/, `${q.tabla} no pide PII`);
// Texto de la pantalla degradada
assert.match(TEXTO_NO_DISPONIBLE, /^Tiempo aún no disponible/);
assert.equal(estadoVistaTiempo({ disponible: false }), "no_disponible");
assert.equal(estadoVistaTiempo(null, { status: 503 }), "no_disponible");
console.log("RESUMEN: tiempo_degradado=ok tabla_ausente=200_disponible_false sin_filas=hay_tiempos_false red=lanza sin_pii_en_columnas=ok estado=verde");
