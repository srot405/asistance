// Calculo PURO de la vista "Entró a clase ajena" (TOC-147). Sin I/O. Una VISITA = una persona-sesion de
// v_asist_tiempo_persona con es_visita=true: la sala donde se midio NO es la franja propia de la persona.
//
// Entradas (las arma lib/servidor/leerVisitas.ts o lib/tiempo-demo.mjs):
//  - filas:          visitas con nombre (PII, solo viaja tras exigirAcceso):
//                    { sesion_id, franja_tiempo|slot_id, fecha, nombre, ciudad, franja_propia, estado_tiempo, pct_tiempo, es_visita }.
//  - franjas:        [{ slot_id, fecha, cuenta_zoom, horario_texto }].
//  - clases:         filas de asist_tiempo_clase { sesion_id, slot_id, visitas } (sirven para cuadrar el total).
//  - noIdentificados: filas de asist_no_identificados { sesion_id, motivo, cantidad }.
// Los veredictos NO se recalculan: se muestra el estado_tiempo guardado por el backend. La matriz origen -> destino NO lleva
// nombres y suprime toda celda con menos de MUESTRA_MINIMA personas (se muestra «<5»).
import { ESTADO_TIEMPO, MUESTRA_MINIMA } from "./tiempoVista.mjs";

export const TEXTO_SUPRIMIDO = `<${MUESTRA_MINIMA}`;
export const SIN_FRANJA_PROPIA = "";

export const VEREDICTO_VISITA = Object.freeze({
  [ESTADO_TIEMPO.CUMPLE]: "Cumple",
  [ESTADO_TIEMPO.ROJO]: "Rojo por tiempo",
  [ESTADO_TIEMPO.SIN_DATO]: "Sin dato de tiempo",
  [ESTADO_TIEMPO.PENDIENTE]: "Pendiente",
});

// Motivos que escribe backend/etl/clasificar_semana.py en asist_no_identificados. Uno desconocido se muestra tal cual.
const MOTIVOS = {
  sin_correo: "Entró a Zoom sin correo: no hay con qué identificarlo",
  correo_no_en_roster: "Su correo no está en el roster de la semana",
  sala_no_resuelta: "La sala de Zoom no se pudo asociar a una clase",
  sala_sin_cuenta: "La sala no tiene una cuenta de Zoom conocida",
  staff_excluido: "Personal de la fundación (se excluye a propósito)",
  "roster no confiable": "La clase tenía un roster poco confiable (se descartó para no fabricar ausencias)",
};
export const etiquetaMotivo = (motivo) => MOTIVOS[motivo] ?? String(motivo);

const n0 = (v) => Number(v ?? 0) || 0;
const esMedido = (estado) => estado === ESTADO_TIEMPO.CUMPLE || estado === ESTADO_TIEMPO.ROJO;
// Conteo publicable: 0 queda 0 (no hay nadie que reidentificar); 1..4 -> null (la pantalla muestra «<5»).
export const suprimir = (n) => (n > 0 && n < MUESTRA_MINIMA ? null : n);
const slotDe = (f) => f.franja_tiempo ?? f.slot_id ?? String(f.sesion_id ?? "").split("|")[1] ?? "";

// Mismo recorte que el CSV nominal de tiempo (listarTiempoNominal): ciudad, franja y cuenta de la franja PROPIA.
export function filtrarVisitas(filas, franjas, filtro = {}) {
  const cuentaDe = new Map(franjas.map((f) => [f.slot_id, f.cuenta_zoom]));
  return filas.filter((f) => f.es_visita === true
    && (!filtro.ciudad || (f.ciudad ?? "") === filtro.ciudad)
    && (!filtro.franja || (f.franja_propia ?? "") === filtro.franja)
    && (!filtro.cuenta || cuentaDe.get(f.franja_propia ?? "") === filtro.cuenta));
}

// Cuadra el total de visitas contra asist_tiempo_clase.visitas, sesion por sesion. Solo sin filtro (con filtro no hay con que comparar).
export function cuadrarVisitas(filas, clases, franjas) {
  if (!clases.length) return { estado: "SIN_COMPARAR", detalle: [] };
  const detalle = [];
  const porSesion = new Map();
  for (const f of filas) porSesion.set(f.sesion_id, (porSesion.get(f.sesion_id) ?? 0) + 1);
  for (const c of clases) {
    const n = porSesion.get(c.sesion_id) ?? 0;
    if (n !== n0(c.visitas)) detalle.push(`${c.slot_id}.visitas: clase=${n0(c.visitas)} pantalla=${n}`);
    porSesion.delete(c.sesion_id);
  }
  for (const [sesion, n] of porSesion) detalle.push(`${sesion}: ${n} visitas en una sesión sin fila de clase`);
  const fechas = new Set(franjas.map((f) => f.fecha));
  const ajenas = filas.filter((f) => f.fecha && !fechas.has(f.fecha)).length;
  if (ajenas) detalle.push(`${ajenas} visitas con fecha fuera de la semana`);
  return { estado: detalle.length ? "DISCREPA" : "OK", detalle };
}

export function armarVisitas({ filas, franjas, clases = [], noIdentificados = [], filtro = {}, semana }) {
  const filtroActivo = Boolean(filtro.ciudad || filtro.franja || filtro.cuenta);
  const horarioDe = new Map(franjas.map((f) => [f.slot_id, f.horario_texto]));
  const rotulo = (slot) => (slot === SIN_FRANJA_PROPIA ? "Sin clase propia" : horarioDe.get(slot) ?? slot);
  const visitasDb = filas.filter((f) => f.es_visita === true);
  const sel = filtrarVisitas(visitasDb, franjas, filtro);

  const visitas = sel.map((f) => {
    const visitada = slotDe(f);
    const propia = f.franja_propia ?? SIN_FRANJA_PROPIA;
    return { visitante: f.nombre ?? "(sin nombre)", ciudad: f.ciudad ?? "", franja_propia: propia, horario_propia: rotulo(propia),
      franja_visitada: visitada, horario_visitada: rotulo(visitada), fecha: f.fecha ?? "",
      pct_tiempo: esMedido(f.estado_tiempo) && f.pct_tiempo != null ? Number(f.pct_tiempo) : null, veredicto: f.estado_tiempo };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.franja_visitada.localeCompare(b.franja_visitada)
    || a.visitante.localeCompare(b.visitante, "es"));

  const cuenta = (lista, estado) => lista.filter((v) => v.veredicto === estado).length;
  const resumen = { total: visitas.length, cumplen: cuenta(visitas, ESTADO_TIEMPO.CUMPLE), rojo: cuenta(visitas, ESTADO_TIEMPO.ROJO),
    sin_dato: cuenta(visitas, ESTADO_TIEMPO.SIN_DATO), pendientes: cuenta(visitas, ESTADO_TIEMPO.PENDIENTE) };

  // Matriz origen -> destino: SIN nombres; toda celda y todo total con 1..4 personas se entrega suprimido (n: null).
  const cel = new Map(), fila = new Map(), col = new Map();
  for (const v of visitas) {
    const k = `${v.franja_propia}\u0000${v.franja_visitada}`;
    cel.set(k, (cel.get(k) ?? 0) + 1);
    fila.set(v.franja_propia, (fila.get(v.franja_propia) ?? 0) + 1);
    col.set(v.franja_visitada, (col.get(v.franja_visitada) ?? 0) + 1);
  }
  const ordenar = (m) => [...m.keys()].sort((a, b) => rotulo(a).localeCompare(rotulo(b), "es"));
  const totales = (m) => ordenar(m).map((slot_id) => ({ slot_id, horario_texto: rotulo(slot_id), n: suprimir(m.get(slot_id)) }));
  const matriz = {
    origenes: totales(fila), destinos: totales(col),
    celdas: [...cel.entries()].map(([k, n]) => { const [origen, destino] = k.split("\u0000"); return { origen, destino, n: suprimir(n) }; }),
  };

  const motivos = new Map();
  for (const r of noIdentificados) motivos.set(r.motivo, (motivos.get(r.motivo) ?? 0) + n0(r.cantidad));
  const por_motivo = [...motivos.entries()].map(([motivo, cantidad]) => ({ motivo, etiqueta: etiquetaMotivo(motivo), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.motivo.localeCompare(b.motivo));

  return {
    disponible: true, semana, filtro: { ciudad: filtro.ciudad ?? null, franja: filtro.franja ?? null, cuenta: filtro.cuenta ?? null },
    visitas, resumen, matriz,
    sin_identificar: { total: por_motivo.reduce((a, m) => a + m.cantidad, 0), por_motivo },
    cuadre: filtroActivo ? { estado: "SIN_COMPARAR", detalle: [] } : cuadrarVisitas(visitasDb, clases, franjas),
  };
}
