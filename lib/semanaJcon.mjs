// JC-ON en la pestana «Semana» (TOC-208, fase 2). Calculo PURO, sin I/O y sin imports de JC: recibe las filas ya leidas de
// jcon.estudiantes / jcon.clases / jcon.asistencia (lib/servidor/leerSemanaJcon.ts o el fixture demo) y devuelve agregados.
//
// Requisito numero uno: JC-ON NUNCA se mezcla con JC. Este modulo no importa detalleCalculo.mjs ni nada de asist_*; su ruta es
// /api/semana-jcon (aparte de /api/datos y /api/detalle) y sus opciones en el selector usan la clave `jcon|<lunes>`, que nunca
// coincide con una fila de data.resultados (`<semana>|<materia>`).
//
// Modelo de datos (scripts/jc-on-transicion/panel/cargar_asistencia_jcon.py):
//  - jcon.clases tiene UNA FILA POR SESION Y GRUPO (horario 'manana' = grupo V, 'tarde' = grupo S). Una SESION es (fecha, tema).
//  - Cada sesion es de UN grupo (su «sala»): tipo 'semana' -> viernes = V, sabado = S; 'bienvenida' -> B1 = V, B2 = S.
//  - jcon.asistencia solo tiene filas de quien entro. La fila va en la clase (sesion X, horario = grupo DE LA PERSONA):
//      fuente 'sheet-zoom'        -> entro a SU sala (X es de su grupo);
//      fuente 'sheet-zoom-visita' -> «colado»: entro a la sala X, que es del OTRO grupo.
//    El calculo no depende de `fuente`: la persona entro a la sesion X; si X es de su grupo es su sala, si no, es colado. `fuente`
//    solo se usa para CONTAR inconsistencias (fuente que no cuadra con el dueno de la sesion), nunca para cambiar un codigo.
//
// Codigos (mismos de la grilla de JC: docs/procesos/panel-asistencia-jc.md y .cell.V/A/N/R?/P de app/globals.css):
//  Dia a dia (una columna por sesion de la semana), persona del grupo g, sesion X del grupo o:
//    o == g: V  = entro a su sala;  A = no entro a la suya pero si a la del otro grupo esa semana;
//            R  = no entro a ninguna sala en la semana (definitivo solo con la semana terminada: despues del domingo); antes R?;
//            P  = pendiente: la sesion aun no tiene datos cargados (no ha ocurrido o el cargador no ha corrido).
//    o != g: N  = entro a esa sala que no es la suya (colado);  - = no aplica.
//  Semana a semana: SI = entro a cualquiera de las dos salas; NO = a ninguna (NO? mientras la semana no termine);
//    P = su propia sesion aun no tiene datos y no ha entrado a ninguna (no es ausencia; sale del denominador, como en JC).
import { GRUPOS_JCON, grupoDeHorario, esActivoJcon, lunesDe, COHORTE_JCON } from "./vivoJcon.mjs";

export const CODIGOS_DIA_JCON = Object.freeze([
  { codigo: "V", texto: "Entró a su sala (la de su grupo)." },
  { codigo: "A", texto: "No entró a su sala, pero sí a la del otro grupo esa semana." },
  { codigo: "N", texto: "Entró a la sala del otro grupo (colado); se marca en el día de esa clase." },
  { codigo: "R", texto: "No entró a ninguna sala en la semana (semana terminada)." },
  { codigo: "R?", texto: "Sin ingreso hasta ahora: la semana no ha terminado y puede cambiar." },
  { codigo: "P", texto: "Pendiente: la clase aún no ocurre o sus datos no se han cargado." },
  { codigo: "-", texto: "No aplica: es la clase del otro grupo y no entró." },
]);
export const CODIGOS_SEMANA_JCON = Object.freeze([
  { codigo: "SI", texto: "Entró a cualquiera de las dos salas en la semana." },
  { codigo: "NO", texto: "No entró a ninguna sala (semana terminada)." },
  { codigo: "NO?", texto: "Sin ingreso hasta ahora: la semana sigue abierta y puede cambiar." },
  { codigo: "P", texto: "Pendiente: su clase aún no tiene datos y no ha entrado a ninguna; no cuenta como ausencia." },
]);
const ORDEN_DIA = CODIGOS_DIA_JCON.map((c) => c.codigo);
const ORDEN_SEMANA = CODIGOS_SEMANA_JCON.map((c) => c.codigo);
export const CLAVE_JCON = "jcon|";
export const esClaveJcon = (clave) => String(clave ?? "").startsWith(CLAVE_JCON);
export const semanaDeClave = (clave) => (esClaveJcon(clave) ? String(clave).slice(CLAVE_JCON.length) : null);

// grupo_ciudad de jcon.estudiantes viene en sigla; los monitores (panel_roles) y JC usan el nombre. Se compara por ambos.
export const CIUDADES_JCON = Object.freeze({ BAQ: "Barranquilla", BOG: "Bogotá", CAL: "Cali", CTG: "Cartagena", MED: "Medellín" });
export const nombreCiudadJcon = (c) => CIUDADES_JCON[String(c ?? "").trim().toUpperCase()] ?? (c == null || c === "" ? null : String(c).trim());

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normTema = (t) => sinAcentos(t).trim().toLowerCase().replace(/\s+/g, " ");
const sumarDias = (fecha, n) => { const d = new Date(`${fecha}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (fecha) => new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 domingo .. 6 sabado
const porcentaje = (parte, total) => (total ? Math.round(((parte * 100) / total) * 100) / 100 : null);

// Dueno de una sesion por su tema/tipo/fecha. null = no se pudo decidir (se intenta luego con las filas `sheet-zoom`).
export function grupoDeSesion({ tipo, tema, fecha }) {
  const t = normTema(tema);
  if (String(tipo ?? "").toLowerCase() === "bienvenida" || t.includes("bienvenida")) {
    if (/\bb1\b/.test(t)) return "V";
    if (/\bb2\b/.test(t)) return "S";
    return null;
  }
  const d = fecha ? diaSemana(fecha) : -1;
  for (const [g, def] of Object.entries(GRUPOS_JCON)) if ((def.desdeLunes + 1) % 7 === d) return g;
  return null;
}

// Fecha de hoy en Colombia (UTC-5, sin horario de verano).
export const hoyCOT = (ms = Date.now()) => new Date(ms - 5 * 3600_000).toISOString().slice(0, 10);
// Semana terminada = ya paso el domingo (hoy > lunes + 6).
export const semanaTerminada = (lunes, hoy) => hoy > sumarDias(lunes, 6);

// Sesiones de la cohorte agrupadas por semana (lunes ISO). Agrega, para semanas de tipo 'semana', la sesion de cada grupo que aun
// no tenga fila en jcon.clases (p. ej. el sabado antes de que corra el cargador): sale como pendiente, nunca como ausencia.
export function sesionesPorSemana(clases, asistencia = []) {
  const porSesion = new Map();
  for (const c of clases ?? []) {
    if (c?.cohorte_jcon != null && String(c.cohorte_jcon) !== COHORTE_JCON) continue;
    if (!c?.fecha) continue;
    const id = `${c.fecha}|${normTema(c.tema)}`;
    const s = porSesion.get(id) ?? { id, fecha: c.fecha, tema: String(c.tema ?? "").trim(), tipo: String(c.tipo ?? "").toLowerCase() || null,
      numero_semana: c.numero_semana ?? null, grupo: grupoDeSesion(c), claseIds: new Set(), sintetica: false };
    s.claseIds.add(Number(c.id));
    porSesion.set(id, s);
  }
  // Respaldo del dueno: la fila `sheet-zoom` (entro a SU sala) dice de que grupo es la sesion.
  const horarioDeClase = new Map((clases ?? []).map((c) => [Number(c.id), grupoDeHorario(c.horario)]));
  for (const s of porSesion.values()) {
    if (s.grupo) continue;
    const votos = new Set((asistencia ?? []).filter((a) => s.claseIds.has(Number(a.clase_id)) && a.fuente === "sheet-zoom")
      .map((a) => horarioDeClase.get(Number(a.clase_id))).filter(Boolean));
    if (votos.size === 1) s.grupo = [...votos][0];
  }
  const semanas = new Map();
  for (const s of porSesion.values()) {
    const lunes = lunesDe(s.fecha);
    const lista = semanas.get(lunes) ?? [];
    lista.push(s);
    semanas.set(lunes, lista);
  }
  for (const [lunes, lista] of semanas) {
    if (!lista.some((s) => s.tipo === "semana")) continue;
    const modelo = lista.find((s) => s.tipo === "semana");
    for (const [g, def] of Object.entries(GRUPOS_JCON)) {
      if (lista.some((s) => s.grupo === g)) continue;
      const fecha = sumarDias(lunes, def.desdeLunes);
      lista.push({ id: `${fecha}|${normTema(modelo.tema)}`, fecha, tema: modelo.tema, tipo: "semana", numero_semana: modelo.numero_semana,
        grupo: g, claseIds: new Set(), sintetica: true });
    }
  }
  for (const lista of semanas.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.grupo ?? "").localeCompare(b.grupo ?? ""));
  return semanas;
}

function etiquetaSemana(lunes, sesiones) {
  if (sesiones.length && sesiones.every((s) => s.tipo === "bienvenida")) return `${lunes} · JC-ON (Bienvenida)`;
  const n = [...new Set(sesiones.map((s) => s.numero_semana).filter((x) => x != null))];
  return n.length === 1 ? `${lunes} · JC-ON · Semana ${n[0]}` : `${lunes} · JC-ON`;
}

// Opciones del selector «Semana y materia» (solo agregados). Mas reciente primero.
export function listarSemanasJcon(clases) {
  const semanas = sesionesPorSemana(clases);
  return [...semanas.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([semana, ss]) => ({ semana, clave: `${CLAVE_JCON}${semana}`,
    etiqueta: etiquetaSemana(semana, ss), bienvenida: ss.every((s) => s.tipo === "bienvenida") }));
}

// Roster de la semana: solo 'activo', con grupo reconocible; sin duplicados por id.
export function rosterSemanaJcon(estudiantes) {
  const filas = [];
  const vistos = new Set();
  let retirados = 0, sinGrupo = 0;
  for (const e of estudiantes ?? []) {
    if (e?.cohorte_jcon != null && String(e.cohorte_jcon) !== COHORTE_JCON) continue;
    if (!esActivoJcon(e.estado)) { retirados += 1; continue; }
    const grupo = grupoDeHorario(e.horario);
    if (!grupo) { sinGrupo += 1; continue; }
    if (vistos.has(Number(e.id))) continue;
    vistos.add(Number(e.id));
    filas.push({ id: Number(e.id), grupo, ciudad: e.grupo_ciudad ?? null,
      nombre: [e.nombres, e.apellidos].map((x) => String(x ?? "").trim()).filter(Boolean).join(" "), cedula: e.cedula == null ? "" : String(e.cedula) });
  }
  return { filas, retirados, sinGrupo };
}

// Base de UNA semana: columnas (sesiones), roster y a que sesiones entro cada persona.
export function construirBaseJcon(lunes, { estudiantes, clases, asistencia }, hoy) {
  const sesiones = sesionesPorSemana(clases, asistencia).get(lunes) ?? [];
  const sesionDeClase = new Map();
  for (const s of sesiones) for (const id of s.claseIds) sesionDeClase.set(id, s);
  const horarioDeClase = new Map((clases ?? []).map((c) => [Number(c.id), grupoDeHorario(c.horario)]));
  const roster = rosterSemanaJcon(estudiantes);
  const grupoDe = new Map(roster.filas.map((p) => [p.id, p.grupo]));
  const entro = new Map();          // persona -> Set(sesion.id)
  const conDatos = new Set();       // sesiones con al menos una fila cargada
  const inconsistencias = { fuente: 0, horario: 0 };
  for (const a of asistencia ?? []) {
    if (a?.asistio === false) continue;
    const s = sesionDeClase.get(Number(a.clase_id));
    if (!s) continue;
    conDatos.add(s.id);
    const pid = Number(a.estudiante_id);
    const g = grupoDe.get(pid);
    if (!g) continue;                // retirado / sin grupo / de otra cohorte: no cuenta (la sesion si queda con datos)
    const set = entro.get(pid) ?? new Set();
    set.add(s.id);
    entro.set(pid, set);
    const propia = s.grupo === g;
    if ((a.fuente === "sheet-zoom" && !propia) || (a.fuente === "sheet-zoom-visita" && propia)) inconsistencias.fuente += 1;
    const h = horarioDeClase.get(Number(a.clase_id));
    if (h && h !== g) inconsistencias.horario += 1;
  }
  const columnas = sesiones.filter((s) => s.grupo).map((s) => ({ id: s.id, fecha: s.fecha, tema: s.tema, tipo: s.tipo, grupo: s.grupo,
    ocurrio: conDatos.has(s.id) }));
  return { semana: lunes, hoy, terminada: semanaTerminada(lunes, hoy), columnas, roster, entro, inconsistencias,
    sinDueno: sesiones.filter((s) => !s.grupo).length };
}

// Codigos de UNA persona: { porColumna: {colId: codigo}, semana: codigo, tipo: 'horario'|'colados'|null }.
export function codigosPersona(base, persona) {
  const sesiones = base.entro.get(persona.id) ?? new Set();
  const propias = base.columnas.filter((c) => c.grupo === persona.grupo);
  const entroPropia = propias.some((c) => sesiones.has(c.id));
  const entroAlguna = base.columnas.some((c) => sesiones.has(c.id));
  const porColumna = {};
  for (const c of base.columnas) {
    if (c.grupo !== persona.grupo) { porColumna[c.id] = sesiones.has(c.id) ? "N" : "-"; continue; }
    if (sesiones.has(c.id)) porColumna[c.id] = "V";
    else if (!c.ocurrio) porColumna[c.id] = "P";
    else if (entroAlguna) porColumna[c.id] = "A";
    else porColumna[c.id] = base.terminada ? "R" : "R?";
  }
  let semana;
  if (entroAlguna) semana = "SI";
  else if (!propias.some((c) => c.ocurrio)) semana = "P";
  else semana = base.terminada ? "NO" : "NO?";
  return { porColumna, semana, tipo: entroPropia ? "horario" : entroAlguna ? "colados" : null };
}

function aplicaFiltro(persona, filtro = {}) {
  if (filtro.grupo && persona.grupo !== filtro.grupo) return false;
  if (filtro.ciudad && !mismaCiudadJcon(persona.ciudad, filtro.ciudad)) return false;
  return true;
}
const normCiudad = (v) => sinAcentos(v).trim().replace(/\s+/g, " ").toLowerCase();
export function mismaCiudadJcon(ciudadJcon, ciudad) {
  if (!ciudad) return true;
  const c = normCiudad(ciudad);
  return Boolean(ciudadJcon) && (normCiudad(ciudadJcon) === c || normCiudad(nombreCiudadJcon(ciudadJcon)) === c);
}

const conteoVacio = (orden) => Object.fromEntries(orden.map((k) => [k, 0]));
function camposIngreso(personas) {
  let horario = 0, colados = 0, medibles = 0, nunca = 0, pendientes = 0;
  for (const p of personas) {
    if (p.cod.semana === "P") { pendientes += 1; continue; }
    medibles += 1;
    if (p.cod.tipo === "horario") horario += 1; else if (p.cod.tipo === "colados") colados += 1; else nunca += 1;
  }
  const ambos = horario + colados;
  return { poblacion: medibles, asistieron: ambos, nunca, pendientes, horario, colados, ambos,
    porcentaje_retencion: porcentaje(ambos, medibles), porcentaje_nunca: porcentaje(nunca, medibles),
    porcentaje_horario: porcentaje(horario, medibles), porcentaje_colados: porcentaje(colados, medibles), porcentaje_ambos: porcentaje(ambos, medibles) };
}

// Agregado de la semana (SIN PII: ni nombre, ni cedula, ni id). filtro = { ciudad?, grupo? }.
export function calcularSemanaJcon(base, filtro = {}) {
  const todas = base.roster.filas.map((p) => ({ ...p, cod: codigosPersona(base, p) }));
  const personas = todas.filter((p) => aplicaFiltro(p, filtro));
  const etiquetaGrupo = (g) => GRUPOS_JCON[g]?.nombre ?? g;
  const columnas = base.columnas.map((c) => {
    const codigos = conteoVacio(ORDEN_DIA);
    for (const p of personas) codigos[p.cod.porColumna[c.id]] += 1;
    // «Dia» como en JC: se cuenta en la clase DE LA PERSONA (su grupo), sobre su roster medible.
    const propios = personas.filter((p) => p.grupo === c.grupo);
    return { id: c.id, fecha: c.fecha, tema: c.tema, tipo: c.tipo, grupo: c.grupo, etiqueta_grupo: etiquetaGrupo(c.grupo), ocurrio: c.ocurrio,
      inscritas: propios.length, codigos, en_curso: !c.ocurrio, ...camposIngreso(propios) };
  });
  const semanal = conteoVacio(ORDEN_SEMANA);
  for (const p of personas) semanal[p.cod.semana] += 1;
  const porGrupo = Object.keys(GRUPOS_JCON).filter((g) => !filtro.grupo || g === filtro.grupo).map((g) => {
    const ps = personas.filter((p) => p.grupo === g);
    const sem = conteoVacio(ORDEN_SEMANA);
    for (const p of ps) sem[p.cod.semana] += 1;
    return { grupo: g, etiqueta: etiquetaGrupo(g), roster: ps.length, semanal: sem, ...camposIngreso(ps) };
  });
  return {
    programa: "jcon", semana: base.semana, terminada: base.terminada, hoy: base.hoy, filtro,
    ciudades: [...new Set(todas.map((p) => nombreCiudadJcon(p.ciudad)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    roster: personas.length, retirados_excluidos: base.roster.retirados, sin_grupo: base.roster.sinGrupo,
    columnas, semanal, porGrupo, resumen: { ...camposIngreso(personas), en_curso: !base.terminada },
    inconsistencias: base.inconsistencias, sesiones_sin_grupo: base.sinDueno,
  };
}

// Nominal (PII): solo para el CSV autenticado de /api/semana-jcon?formato=csv. Una fila por persona activa del recorte.
export function filasNominalJcon(base, filtro = {}) {
  const columnas = base.columnas;
  const cab = ["nombre", "cedula", "ciudad", "grupo", ...columnas.map((c) => `${c.fecha} ${c.tema} (sala ${GRUPOS_JCON[c.grupo]?.nombre ?? c.grupo})`), "semana"];
  const filas = base.roster.filas.filter((p) => aplicaFiltro(p, filtro)).map((p) => ({ p, cod: codigosPersona(base, p) }))
    .sort((a, b) => a.p.grupo.localeCompare(b.p.grupo) || a.p.nombre.localeCompare(b.p.nombre, "es"))
    .map(({ p, cod }) => [p.nombre, p.cedula, nombreCiudadJcon(p.ciudad) ?? "", GRUPOS_JCON[p.grupo].nombre, ...columnas.map((c) => cod.porColumna[c.id]), cod.semana]);
  return [cab, ...filas];
}
export const LEYENDA_CSV_JCON = "Día: " + CODIGOS_DIA_JCON.map((c) => `${c.codigo}=${c.texto}`).join(" | ") +
  " || Semana: " + CODIGOS_SEMANA_JCON.map((c) => `${c.codigo}=${c.texto}`).join(" | ");
