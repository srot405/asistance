// Ingresos de la semana (o de un dia) para los botones generales del calendario de la pestana Semana: quien entro en su
// horario, quien se colo a una clase que no es la suya, o ambos. Sin I/O. Una fila por persona y clase a la que entro
// (asist_entradas ya trae las visitas). En pantalla solo salen conteos (contarPorDia); las filas con nombre solo van al CSV.
// "En su horario" = la franja de la sesion esta entre las franjas de la persona en asist_roster de esa semana; si no, "otra clase".
// Los filtros siguen la semantica del calendario: ciudad = ciudad de la persona; franja y cuenta = la clase A LA QUE ENTRO.
export const TIPOS_INGRESO = ["propias", "otras", "ambos"];
export const ETIQUETA_TIPO = { propia: "En su horario", otra: "Se coló a otra clase" };

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// roster: [{ persona_id, nombre, ciudad, slot_id }]; franjas: [{ slot_id, fecha, cuenta_zoom, horario_texto }];
// sesiones: [{ sesion_id, slot_id, fecha }]; entradas: [{ persona_id, sesion_id, primera_entrada? }]
// fecha = null -> toda la semana.
export function armarIngresosDia({ fecha = null, roster, franjas, sesiones, entradas, filtro = {} }) {
  const franja = new Map(franjas.map((f) => [f.slot_id, f]));
  const sesion = new Map(sesiones.filter((s) => fecha == null || s.fecha === fecha).map((s) => [s.sesion_id, s]));
  const personas = new Map();
  for (const r of roster) {
    let p = personas.get(r.persona_id);
    if (!p) { p = { nombre: r.nombre, ciudad: r.ciudad, slots: new Set() }; personas.set(r.persona_id, p); }
    if (r.slot_id) p.slots.add(r.slot_id);
  }
  const vistas = new Set();
  const filas = [];
  for (const e of entradas) {
    const s = sesion.get(e.sesion_id);
    if (!s) continue;
    const clave = `${e.persona_id}|${s.slot_id}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const p = personas.get(e.persona_id);
    const f = franja.get(s.slot_id);
    if (filtro.franja && s.slot_id !== filtro.franja) continue;
    if (filtro.cuenta && sinAcentos(f?.cuenta_zoom) !== sinAcentos(filtro.cuenta)) continue;
    if (filtro.ciudad && sinAcentos(p?.ciudad) !== sinAcentos(filtro.ciudad)) continue;
    const propia = Boolean(p?.slots.has(s.slot_id));
    filas.push({
      tipo: propia ? "propia" : "otra", fecha: s.fecha,
      nombre: p?.nombre ?? "(fuera del roster)", cedula: e.persona_id, ciudad: p?.ciudad ?? null,
      clase_entro: f?.horario_texto ?? s.slot_id, slot_entro: s.slot_id,
      su_clase: p ? [...p.slots].map((x) => franja.get(x)?.horario_texto ?? x).join(" / ") : null,
      cuenta_zoom: f?.cuenta_zoom ?? null, primera_entrada: e.primera_entrada ?? null,
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clase_entro.localeCompare(b.clase_entro) || (a.tipo === b.tipo ? 0 : a.tipo === "otra" ? -1 : 1)
    || String(a.nombre).localeCompare(String(b.nombre), "es"));
  const propias = filas.filter((x) => x.tipo === "propia").length;
  return { fecha, conteo: { propias, otras: filas.length - propias, ambos: filas.length }, filas };
}

export function filtrarTipo(resultado, tipo) {
  if (tipo === "propias") return resultado.filas.filter((f) => f.tipo === "propia");
  if (tipo === "otras") return resultado.filas.filter((f) => f.tipo === "otra");
  return resultado.filas;
}

// Conteos por fecha (lo unico que va a la pantalla): [{ fecha, propias, otras, ambos }]
export function contarPorDia(filas) {
  const m = new Map();
  for (const f of filas) {
    let c = m.get(f.fecha);
    if (!c) { c = { fecha: f.fecha, propias: 0, otras: 0, ambos: 0 }; m.set(f.fecha, c); }
    c[f.tipo === "propia" ? "propias" : "otras"] += 1; c.ambos += 1;
  }
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function filasCsvIngresos(filas) {
  return [["fecha_clase", "tipo", "nombre", "cedula", "ciudad", "clase_a_la_que_entro", "cuenta_zoom", "su_clase", "primera_entrada"],
    ...filas.map((f) => [f.fecha, ETIQUETA_TIPO[f.tipo], f.nombre, f.cedula, f.ciudad ?? "", f.clase_entro, f.cuenta_zoom ?? "", f.su_clase ?? "", f.primera_entrada ?? ""])];
}
