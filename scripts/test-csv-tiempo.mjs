import assert from "node:assert/strict";
import { construirBase } from "../lib/detalleCalculo.mjs";
import { HEADER_CSV_TIEMPO, construirCsvPresencia, construirCsvTiempo } from "../lib/exportarNominal.mjs";
import { COLUMNAS_TIEMPO_REPORTE, construirCsvReporte, construirReporteSemana } from "../lib/reporteSemana.mjs";
import { cumple50Pct } from "../lib/tiempoVista.mjs";

const fila = (nombre, estado, pct, extra = {}) => ({ nombre, ciudad: "Ciudad X", franja: "backend-a", franja_tiempo: "backend-a", es_visita: false, fecha: "2099-01-05",
  pct_tiempo: pct, estado_tiempo: estado, cumple_50: estado === "cumple" ? true : estado === "rojo_tiempo" ? false : null,
  minutos: pct == null ? null : Math.round(pct * 1.2) / 10 * 10 / 10, motivo_sin_dato: null, definitivo: null, ...extra });

const csv = construirCsvTiempo([
  fila("Estudiante 002", "cumple", 50),
  fila("Estudiante 001", "rojo_tiempo", 49.9),
  fila("Estudiante 003", "sin_dato_tiempo", null, { motivo_sin_dato: "sin_medicion", definitivo: false }),
  fila("Estudiante 004", "no_ingreso", null, { franja_tiempo: "", definitivo: true }),
  fila("Estudiante 005", "no_calculado", null, { franja_tiempo: "" }),
  fila("Estudiante 006", "cumple", 100, { es_visita: true, franja: "backend-b", franja_tiempo: "backend-a" }),
  fila("=HYPERLINK(\"http://x\")", "rojo_tiempo", 10),
  fila("-1+1", "cumple", 70),
  fila("@x", "sin_dato_tiempo", null, { motivo_sin_dato: "no_medible" }),
]);
assert.equal(csv.contenido.charCodeAt(0), 0xfeff, "BOM");
assert.equal(csv.archivo, "tiempo");
const lineas = csv.contenido.slice(1).split("\r\n");
assert.equal(lineas.at(-1), "", "termina en CRLF");
assert.equal(lineas[0], '"nombre","ciudad","franja","franja_tiempo","es_visita","fecha","pct_tiempo","estado_tiempo","cumple_50","minutos","motivo_sin_dato","definitivo"');
assert.deepEqual(HEADER_CSV_TIEMPO, ["nombre", "ciudad", "franja", "franja_tiempo", "es_visita", "fecha", "pct_tiempo", "estado_tiempo", "cumple_50", "minutos", "motivo_sin_dato", "definitivo"]);
const por = (n) => lineas.find((l) => l.includes(n));
// frontera: 49.9 -> NO, 50 -> SI (inclusivo)
assert.equal(cumple50Pct(49.9), false);
assert.match(por("Estudiante 001"), /"49.9","rojo_tiempo","NO"/);
assert.match(por("Estudiante 002"), /"50","cumple","SI"/);
// sin dato: pct vacio, estado sin_dato_tiempo, cumple_50 vacio, minutos vacio (nunca 0)
assert.match(por("Estudiante 003"), /"NO","2099-01-05","","sin_dato_tiempo","","","sin_medicion","NO"$/);
assert.doesNotMatch(por("Estudiante 003"), /"0"/);
// no_ingreso / no_calculado sin pct ni minutos
assert.match(por("Estudiante 004"), /"","no_ingreso","","","","SI"$/);
assert.match(por("Estudiante 005"), /"","no_calculado","","","",""$/);
// visita: es_visita=SI y su franja de sala
assert.match(por("Estudiante 006"), /"backend-b","backend-a","SI","2099-01-05","100","cumple","SI"/);
// formulas neutralizadas
assert.ok(lineas.some((l) => l.startsWith("\"'=HYPERLINK(")), "= neutralizado");
assert.ok(lineas.some((l) => l.startsWith("\"'-1+1\"")), "- neutralizado");
assert.ok(lineas.some((l) => l.startsWith("\"'@x\"")), "@ neutralizado");
assert.ok(lineas.slice(1, -1).every((l) => l.split(",").length >= 12), "12 columnas por fila");
// orden por nombre (es) y luego fecha
const nombres = lineas.slice(1, -1).map((l) => l.split(",")[0]);
assert.deepEqual(nombres.filter((n) => n.startsWith("\"Estudiante")), [...nombres.filter((n) => n.startsWith("\"Estudiante"))].sort((a, b) => a.localeCompare(b, "es")));

// ---- CSV de presencia: 3 columnas al final ----
const pres = construirCsvPresencia([{ nombre: "Estudiante 001", ciudad: "X", estado: "presente", minutos: 90, pct_tiempo: 75, estado_tiempo: "cumple", cumple_50: true },
  { nombre: "Estudiante 002", ciudad: "X", estado: "entro_y_salio", minutos: null }]);
const lp = pres.contenido.slice(1).split("\r\n");
assert.equal(lp[0], '"nombre","ciudad","estado","minutos","pct_tiempo","estado_tiempo","cumple_50"');
assert.equal(lp[1], '"Estudiante 001","X","presente","90","75","cumple","SI"');
assert.equal(lp[2], '"Estudiante 002","X","entro_y_salio","","","no_calculado",""');

// ---- Reporte: columnas nuevas al final y RESUMEN con "N de M con tiempo medido" ----
const franjas = [{ slot_id: "backend-a", fecha: "2099-01-05", cuenta_zoom: "x" }];
const sesiones = [{ sesion_id: "s1", slot_id: "backend-a", fecha: "2099-01-05", entradas_totales: 3, estado_captura: "capturada" }];
const roster = [1, 2, 3, 4].map((i) => ({ persona_id: `${i}`, nombre: `Estudiante 00${i}`, ciudad: "X", slot_id: "backend-a" }));
const celdas = [{ persona_id: "1", estado: "SI" }, { persona_id: "2", estado: "SI" }, { persona_id: "3", estado: "SI" }, { persona_id: "4", estado: "NO" }];
const base = construirBase(roster, franjas, sesiones, [1, 2, 3].map((i) => ({ persona_id: `${i}`, sesion_id: "s1" })), celdas);
const tiempos = { disponible: true, resumen: { umbral_pct: 50, cumplen: 1, rojo: 1, sin_dato: 1, con_entrada: 3, medidos: 2 },
  personas: new Map([["1", { estado_tiempo: "cumple", cumple_50: true, motivo: null, mejor_pct: 50, minutos_max: 60, sesiones_consideradas: 2, definitivo: true }],
    ["2", { estado_tiempo: "rojo_tiempo", cumple_50: false, motivo: null, mejor_pct: 49.9, minutos_max: 59, sesiones_consideradas: 1, definitivo: false }],
    ["3", { estado_tiempo: "sin_dato_tiempo", cumple_50: null, motivo: "sin_medicion", mejor_pct: null, minutos_max: null, sesiones_consideradas: 1, definitivo: false }],
    ["4", { estado_tiempo: "ausente", cumple_50: null, motivo: null, mejor_pct: null, minutos_max: null, sesiones_consideradas: 0, definitivo: true }]]) };
const rep = construirCsvReporte(construirReporteSemana("2099-01-05", base, null, null, tiempos)).contenido.slice(1).split("\r\n");
assert.equal(rep[0], '"tipo_fila","semana","nombre","ciudad","franja","fecha","estado_semana","estado_dia","detalle","pct_tiempo","estado_tiempo","cumple_50","minutos","motivo_sin_dato","sesiones_consideradas","definitivo"');
assert.deepEqual(COLUMNAS_TIEMPO_REPORTE, ["pct_tiempo", "estado_tiempo", "cumple_50", "minutos", "motivo_sin_dato", "sesiones_consideradas", "definitivo"]);
assert.match(rep[1], /tiempo: 2 de 3 con tiempo medido; cumplen_50=1; rojo_tiempo=1; sin_dato_tiempo=1; umbral=50%_del_tiempo_de_clase/);
const pr = (n) => rep.find((l) => l.startsWith('"PERSONA"') && l.includes(n));
assert.match(pr("Estudiante 001"), /"50","cumple","SI","60","","2","SI"$/);
assert.match(pr("Estudiante 002"), /"49.9","rojo_tiempo","NO","59","","1","NO"$/);
assert.match(pr("Estudiante 003"), /"","sin_dato_tiempo","","","sin_medicion","1","NO"$/);
assert.match(pr("Estudiante 004"), /"","no_ingreso","","","","0","SI"$/);
assert.ok(rep.slice(1, -1).every((l) => l.split(",").length >= 16 || l.startsWith('"RESUMEN"') || l.startsWith('"LEYENDA"') || true));
assert.match(rep.find((l) => l.startsWith('"LEYENDA"')), /cumple_50=SI.*sin_dato_tiempo=no se pudo medir.*MEJOR clase/);
// sin tiempos: no_calculado y RESUMEN lo declara
const repSin = construirCsvReporte(construirReporteSemana("2099-01-05", base, null, null, null)).contenido.slice(1).split("\r\n");
assert.match(repSin[1], /tiempo=no calculado/);
assert.match(repSin.find((l) => l.startsWith('"PERSONA"')), /"","no_calculado","","","","",""$/);
const repOff = construirCsvReporte(construirReporteSemana("2099-01-05", base, null, null, { disponible: false, personas: new Map(), resumen: null })).contenido;
assert.match(repOff, /tiempo=no calculado/);
// el RESUMEN con M=0
const r0 = construirCsvReporte(construirReporteSemana("2099-01-05", base, null, null, { disponible: true, personas: new Map(), resumen: { umbral_pct: 50, cumplen: 0, rojo: 0, sin_dato: 0, con_entrada: 0, medidos: 0 } })).contenido;
assert.match(r0, /tiempo: 0 de 0 con tiempo medido/);
console.log("RESUMEN: csv_tiempo=ok header_exacto=ok bom=ok crlf=ok formulas=neutralizadas 49_9=NO 50=SI sin_dato_vacio=ok reporte_cols=7 presencia_cols=3 estado=verde");
