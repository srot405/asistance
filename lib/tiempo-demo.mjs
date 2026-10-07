// Datos SINTETICOS (nadie real) para la pestana Tiempo en MODO_DEMO y para los tests. Se construyen con una
// semilla fija sobre DETALLE_DEMO_BASE (mismos roster/entradas que el resto del demo, "Persona Demo NNN"), asi
// el total de "ingresaron" de la vista Tiempo cuadra por construccion con el detalle de la misma semana.
// Entrega las MISMAS formas que el backend (082/083): filas de asist_tiempo_clase, filas persona-sesion y filas
// de v_asist_tiempo_semana, para pasar por las mismas funciones puras que usa el servidor.
//
// Escenarios (plan 03 §5.2): 09-14 semana completa con tiempos (cerrada); 09-21 con UNA clase entera sin medicion
// (miercoles 18) y otra con cobertura baja (martes 18), sabado sin clase; 09-28 ABIERTA/PROVISIONAL con una sola
// clase dictada y el resto pendiente (cobertura 0 en esas clases); una semana sin ninguna fila de tiempo se
// obtiene simplemente no teniendo clases (el historico demo trae semanas Solo semanal sin tiempos).
import { DETALLE_DEMO_BASE } from "./detalle-demo.mjs";
import { construirHistograma } from "./histogramaTiempo.mjs";
import { cumple50, pctTiempo } from "./tiempoVista.mjs";
import { percentiles } from "./tiempoCalculo.mjs";

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (texto) => [...texto].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const ESTADOS_SEMANA = { "2026-09-14": "cerrada", "2026-09-21": "cerrada", "2026-09-28": "abierta" };
const CERRADA_EN = { "2026-09-14": "2026-09-21T13:00:00Z", "2026-09-21": "2026-09-28T13:00:00Z" };
const CONGELADA_EN = { "2026-09-14": "2026-09-14T12:00:00Z", "2026-09-21": "2026-09-21T12:00:00Z", "2026-09-28": "2026-09-28T12:00:00Z" };

function ventanaSegundos(slotId) { return slotId.includes("avanzado") ? 6300 : 7200; }

function construirSemana(semana) {
  const base = DETALLE_DEMO_BASE[semana];
  const estadoSemana = ESTADOS_SEMANA[semana];
  const rosterPorId = new Map(base.roster.map((p) => [p.persona_id, p]));
  const franjaPorSlot = new Map(base.franjas.map((f) => [f.slot_id, f]));
  const sesiones = base.sesiones;
  const personas = [];

  for (const ses of sesiones) {
    const rng = mulberry32(hash(`${semana}|${ses.slot_id}`));
    const franja = franjaPorSlot.get(ses.slot_id);
    const ventana = ventanaSegundos(ses.slot_id);
    const entran = base.entradas.filter((e) => e.sesion_id === ses.sesion_id);
    const sinMedicionTotal = semana === "2026-09-21" && ses.slot_id === "backend-miércoles-18";
    const probSinDato = sinMedicionTotal ? 1 : semana === "2026-09-21" && ses.slot_id === "backend-martes-18" ? 0.45 : 0.06;
    for (const e of entran) {
      const p = rosterPorId.get(e.persona_id);
      const fila = { sesion_id: ses.sesion_id, slot_id: ses.slot_id, fecha: franja.fecha, es_visita: false,
        franja_propia: p.slot_id, ciudad: p.ciudad, persona_id: p.persona_id, nombre: p.nombre, segundos: null, pct_tiempo: null,
        estado_tiempo: "sin_dato_tiempo", cumple_50: null, motivo: sinMedicionTotal ? "sin_medicion" : "no_medible" };
      if (rng() >= probSinDato) {
        const segundos = Math.floor((rng() < 0.78 ? 0.5 + rng() * 0.5 : 0.05 + rng() * 0.449) * ventana);
        const cumple = cumple50(segundos, ventana);
        Object.assign(fila, { segundos, pct_tiempo: pctTiempo(segundos, ventana), estado_tiempo: cumple ? "cumple" : "rojo_tiempo",
          cumple_50: cumple, motivo: null });
      }
      personas.push(fila);
    }
  }
  // Visitas: personas que ya entraron a SU clase y ademas pasaron por otra sala de la misma semana.
  const propias = personas.filter((f) => !f.es_visita);
  propias.forEach((f, i) => {
    if (i % 29 !== 0) return;
    const rng = mulberry32(hash(`${semana}|visita|${f.persona_id}`));
    const otras = sesiones.filter((s) => s.slot_id !== f.slot_id && (s.entradas_totales ?? 0) > 0);
    if (!otras.length) return;
    const ses = otras[Math.floor(rng() * otras.length)];
    const ventana = ventanaSegundos(ses.slot_id);
    const segundos = Math.floor((0.1 + rng() * 0.85) * ventana);
    const cumple = cumple50(segundos, ventana);
    personas.push({ sesion_id: ses.sesion_id, slot_id: ses.slot_id, fecha: franjaPorSlot.get(ses.slot_id).fecha, es_visita: true,
      franja_propia: f.franja_propia, ciudad: f.ciudad, persona_id: f.persona_id, nombre: f.nombre, segundos,
      pct_tiempo: pctTiempo(segundos, ventana), estado_tiempo: cumple ? "cumple" : "rojo_tiempo", cumple_50: cumple, motivo: null });
  });

  // asist_no_identificados (forma de PostgREST): conteos sinteticos por motivo, deterministas por semana.
  const rngNoId = mulberry32(hash(`${semana}|no-identificados`));
  const noIdentificados = [["sin_correo", 3], ["correo_no_en_roster", 9], ["staff_excluido", 4]]
    .map(([motivo, tope]) => ({ sesion_id: sesiones[0]?.sesion_id ?? `${semana}|sala-demo`, motivo, cantidad: 1 + Math.floor(rngNoId() * tope) }));

  // asist_tiempo_clase (forma de PostgREST)
  const clases = sesiones.map((ses) => {
    const franja = franjaPorSlot.get(ses.slot_id);
    const filas = personas.filter((f) => f.sesion_id === ses.sesion_id);
    const propias = filas.filter((f) => !f.es_visita);
    const visitas = filas.filter((f) => f.es_visita);
    const cuenta = (lista, estado) => lista.filter((f) => f.estado_tiempo === estado).length;
    const medidos = propias.filter((f) => f.pct_tiempo != null);
    const pcts = medidos.map((f) => f.pct_tiempo);
    const pc = percentiles(pcts);
    const sinClase = ses.estado_captura !== "capturada" && (ses.entradas_totales ?? 0) === 0 && estadoSemana === "cerrada";
    const pendiente = !sinClase && (ses.entradas_totales ?? 0) === 0 && estadoSemana === "abierta";
    const sinMedicion = propias.length > 0 && medidos.length === 0;
    return {
      sesion_id: ses.sesion_id, slot_id: ses.slot_id, fecha: franja.fecha,
      estado_captura: sinClase ? "sin_clase" : pendiente ? "por_ocurrir" : "capturada",
      roster_n: base.roster.filter((p) => p.slot_id === ses.slot_id).length,
      ingresaron_propios: propias.length, visitas: visitas.length, visitas_cumplen: cuenta(visitas, "cumple"),
      visitas_rojo: cuenta(visitas, "rojo_tiempo"), visitas_sin_dato: cuenta(visitas, "sin_dato_tiempo"),
      n_medibles: medidos.length, n_cumplen: cuenta(propias, "cumple"), n_rojo: cuenta(propias, "rojo_tiempo"),
      n_sin_dato: cuenta(propias, "sin_dato_tiempo"), n_pendiente: 0, n_parciales: 0,
      n_no_medibles: propias.filter((f) => f.motivo === "no_medible").length,
      mediana_pct: pc.mediana, p10_pct: pc.p10, p90_pct: pc.p90,
      hist: medidos.length >= 5 ? construirHistograma(pcts).bins.map((b) => b.n) : null,
      cobertura: propias.length ? Math.round((medidos.length * 10000) / propias.length) / 100 : null,
      fin_clase_min: sinClase || pendiente ? null : ventanaSegundos(ses.slot_id) / 60, fin_confiable: !(sinClase || pendiente),
      clase_evaluable: !(sinClase || pendiente || sinMedicion),
      motivo_no_evaluable: sinClase ? "sin_clase" : pendiente ? "pendiente" : sinMedicion ? "sin_medicion" : null, umbral_pct: 50,
    };
  });

  // Veredicto semanal por persona: la MEJOR sesion (propias + visitas); nunca suma de tiempos.
  const porPersona = new Map();
  for (const f of personas) porPersona.set(f.persona_id, [...(porPersona.get(f.persona_id) ?? []), f]);
  let cumplen = 0, rojo = 0, sinDato = 0;
  const semanalPorPersona = new Map();
  for (const [id, filas] of porPersona) {
    const estados = filas.map((f) => f.estado_tiempo);
    const estado = estados.includes("cumple") ? "cumple" : estados.includes("sin_dato_tiempo") ? "sin_dato_tiempo" : "rojo_tiempo";
    if (estado === "cumple") cumplen += 1; else if (estado === "rojo_tiempo") rojo += 1; else sinDato += 1;
    const mejor = filas.filter((f) => f.pct_tiempo != null).sort((a, b) => b.pct_tiempo - a.pct_tiempo)[0];
    semanalPorPersona.set(id, { estado_tiempo: estado, cumple_50: estado === "cumple" ? true : estado === "rojo_tiempo" ? false : null,
      motivo: estado === "sin_dato_tiempo" ? (filas.find((f) => f.motivo)?.motivo ?? "sin_medicion") : null,
      mejor_pct: mejor?.pct_tiempo ?? null, minutos_max: mejor?.segundos == null ? null : Math.floor(mejor.segundos / 60),
      sesiones_consideradas: filas.length, definitivo: estadoSemana === "cerrada" || estado === "cumple" });
  }
  const ausentes = base.celdas.filter((c) => c.estado === "NO").length;
  const conEntrada = base.celdas.filter((c) => c.estado === "SI").length;
  const rosterN = base.roster.length;
  const resumenFila = {
    tiempo_umbral_pct: 50, tiempo_roster: rosterN, tiempo_cumplen: cumplen, tiempo_rojo: rojo, tiempo_sin_dato: sinDato,
    tiempo_ausentes: ausentes, tiempo_sin_clase: rosterN - cumplen - rojo - sinDato - ausentes, tiempo_pendientes: 0,
    tiempo_con_entrada: conEntrada, tiempo_medidos: cumplen + rojo,
    tiempo_cobertura: conEntrada ? Math.round(((cumplen + rojo) * 10000) / conEntrada) / 100 : null,
    tiempo_definitivo: estadoSemana === "cerrada",
  };
  const suma = (k) => clases.reduce((a, c) => a + c[k], 0);
  const filaSerie = {
    semana, clases: clases.length, clases_evaluables: clases.filter((c) => c.clase_evaluable).length, roster_franjas: suma("roster_n"),
    n_ingresaron: suma("ingresaron_propios"), n_medibles: suma("n_medibles"), n_cumplen: suma("n_cumplen"), n_rojo: suma("n_rojo"),
    n_sin_dato: suma("n_sin_dato"), n_pendiente: 0, estado_semana: estadoSemana, congelada_en: CONGELADA_EN[semana],
    cerrada_en: CERRADA_EN[semana] ?? null, provisional: estadoSemana !== "cerrada", ...resumenFila,
  };
  return {
    clases, personas, noIdentificados, franjas: base.franjas.map((f) => ({ slot_id: f.slot_id, fecha: f.fecha, cuenta_zoom: f.cuenta_zoom, horario_texto: f.horario_texto })),
    info: { semana, roster: rosterN, congelada_en: CONGELADA_EN[semana], reconstruida: false, provisional: estadoSemana !== "cerrada",
      cerrada_en: CERRADA_EN[semana] ?? null, umbral_pct: 50 },
    resumenFila, filaSerie, semanalPorPersona,
  };
}

export const TIEMPO_DEMO = Object.fromEntries(Object.keys(DETALLE_DEMO_BASE).map((s) => [s, construirSemana(s)]));
export const TIEMPO_DEMO_SERIE = Object.values(TIEMPO_DEMO).map((t) => t.filaSerie);
