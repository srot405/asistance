import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as v from "../lib/vivoCalculo.mjs";

// Datos sinteticos: correos @ejemplo.test, nombres "Estudiante NNN". Sin PII.
const ms = (iso) => Date.parse(iso); // iso con offset -05:00
const COTISO = (fecha, hhmm, ss = "00") => ms(`${fecha}T${hhmm}:${ss}-05:00`);

// ---------- PARIDAD con backend (Python): resolver_franja / resolver_franja_sin_cuenta / cuenta_de_host / es_clase
const par = JSON.parse(await readFile(new URL("../data/paridad-vivo.json", import.meta.url), "utf8"));
const franjasPar = par.franjas.map((f) => ({ ...f, fecha: "2026-10-03", hora_fin: f.hora_inicio + 2, roster_n: 50 }));
let coincidencias = 0;
for (const c of par.casos) {
  const got = v.asociarSalaAFranja({ host: c.host, topic: c.topic, primerMs: c.ms }, franjasPar);
  assert.equal(got, c.slot, `paridad Python: host=${c.host} ms=${c.ms} topic=${c.topic}`);
  if (c.slot) coincidencias += 1;
}
assert.ok(par.casos.length > 1000 && coincidencias > 100, "paridad con casos resueltos y no resueltos");
for (const [curso, esperado] of Object.entries(par.es_clase)) assert.equal(v.esClase(curso === "null" ? null : curso), esperado, `es_clase(${curso})`);

// ---------- fixtures de la semana
const F = (slot, dia, fecha, h, cuenta, tipo = "Basico", n = 50) => ({ slot_id: slot, dia, fecha, hora_inicio: h, hora_fin: h + 2, tipo, cuenta_zoom: cuenta, roster_n: n });
const SAB = "2026-10-03";
const franjas = [
  F("backend-miércoles-18", "miércoles", "2026-09-30", 18, "jovenescreativos", "Basico", 56),
  F("backend-sábado-08-avanzado", "sábado", SAB, 8, "soporte", "Avanzado", 55),
  F("backend-sábado-08-dos", "sábado", SAB, 8, "jovenescreativos", "Basico", 52),
  F("backend-sábado-08-uno", "sábado", SAB, 8, "comunicaciones", "Basico", 50),
  F("backend-sábado-10", "sábado", SAB, 10, "comunicaciones", "Basico", 52),
];
const rosterCorreos = Array.from({ length: 60 }, (_, i) => `estudiante${String(i + 1).padStart(3, "0")}@ejemplo.test`);
const roster = new Set(rosterCorreos.map(v.hashCorreo));
let nid = 1;
const ev = (evento, correo, hhmm, extra = {}) => v.compactarEvento({ id: nid++, evento, correo, nombre: extra.nombre ?? null,
  hora_ms: COTISO(extra.fecha ?? SAB, hhmm, extra.ss ?? "00") });
const cl = (eventos, ahora = COTISO(SAB, "09:00")) => v.clasificarEventos(eventos, roster, ahora);

// ---------- clasificarEventos
{ // joined normal + left posterior
  const r = cl([ev("joined", rosterCorreos[0], "08:01"), ev("joined", rosterCorreos[1], "08:02"), ev("left", rosterCorreos[0], "08:40")]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora], [2, 1]);
}
{ // joined perdido (solo left): cuenta en el maximo, no en ahora; es huerfano
  const r = cl([ev("left", rosterCorreos[2], "08:30")]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora, r.huerfanos], [1, 0, 1]);
}
{ // reconexion: joined, left, joined -> una persona, presente
  const r = cl([ev("joined", rosterCorreos[3], "08:01"), ev("left", rosterCorreos[3], "08:10"), ev("joined", rosterCorreos[3], "08:12")]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora], [1, 1]);
}
{ // dos joined seguidos (left perdido): tope 1 por persona
  const r = cl([ev("joined", rosterCorreos[4], "08:01"), ev("joined", rosterCorreos[4], "08:15")]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora], [1, 1]);
}
{ // saldo nunca negativo: left left joined -> presente (saldo 1), no -1
  const r = cl([ev("left", rosterCorreos[5], "08:01"), ev("left", rosterCorreos[5], "08:02"), ev("joined", rosterCorreos[5], "08:03")]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora], [1, 1]);
}
{ // correo con mayusculas y espacios == mismo correo del roster
  const r = cl([ev("joined", `  ${rosterCorreos[6].toUpperCase()} `, "08:01")]);
  assert.deepEqual([r.roster.maximo, r.desconocidos.maximo], [1, 0]);
}
{ // personal @tocaunavida.org (cualquier capitalizacion) no cuenta como roster ni desconocido
  const r = cl([ev("joined", "Docente.Uno@TocaUnaVida.org", "08:00"), ev("joined", "monitor@tocaunavida.org", "08:01")]);
  assert.deepEqual([r.personal.maximo, r.personal.ahora, r.roster.maximo, r.desconocidos.maximo], [2, 2, 0, 0]);
}
{ // desconocido con correo ajeno al roster; mismo correo = una persona; sin correo se distingue por nombre normalizado
  const r = cl([ev("joined", "otra@ejemplo.test", "08:01"), ev("left", "otra@ejemplo.test", "08:05"), ev("joined", "OTRA@ejemplo.test", "08:07"),
    ev("joined", null, "08:02", { nombre: "Estudiante 900" }), ev("joined", "", "08:03", { nombre: "  estudiante  900 " }), ev("joined", null, "08:04", { nombre: "Estudiante 901" })]);
  assert.deepEqual([r.desconocidos.maximo, r.desconocidos.ahora], [3, 3]);
}
{ // sin correo ni nombre: cada fila es una persona
  const r = cl([ev("joined", null, "08:01"), ev("joined", null, "08:02")]);
  assert.equal(r.desconocidos.maximo, 2);
}
{ // ordenados por hora_ms (no por llegada): left llegado antes en la lista pero posterior en el tiempo
  const a = ev("left", rosterCorreos[7], "08:30"); const b = ev("joined", rosterCorreos[7], "08:05");
  const r = cl([a, b]);
  assert.deepEqual([r.roster.maximo, r.roster.ahora, r.huerfanos], [1, 0, 0]);
}
{ // eventos futuros respecto a "ahora" se ignoran (replay)
  const r = cl([ev("joined", rosterCorreos[8], "08:01"), ev("joined", rosterCorreos[9], "09:30")], COTISO(SAB, "09:00"));
  assert.equal(r.roster.maximo, 1);
}
{ // cobertura baja: >= 5 eventos y huerfanos/lefts >= 0,30
  const e = [ev("joined", rosterCorreos[10], "08:01"), ev("left", rosterCorreos[11], "08:02"), ev("left", rosterCorreos[12], "08:03"),
    ev("left", rosterCorreos[13], "08:04"), ev("left", rosterCorreos[10], "08:05")];
  const r = cl(e);
  assert.equal(r.eventos, 5); assert.ok(r.ratio_huerfanos >= 0.3); assert.equal(r.cobertura_baja_eventos, true);
  assert.equal(cl(e.slice(0, 4)).cobertura_baja_eventos, false, "menos de 5 eventos no marca");
  const sano = cl([1, 2, 3, 4, 5].map((i) => ev("joined", rosterCorreos[i], "08:01")));
  assert.equal(sano.cobertura_baja_eventos, false);
}
// el resultado nunca contiene correos ni nombres
{ const r = JSON.stringify(cl([ev("joined", rosterCorreos[0], "08:01", { nombre: "Estudiante 001" })]));
  assert.ok(!/ejemplo|Estudiante|@/.test(r)); }

// ---------- estadoClase / ventana (frontera)
const f10 = franjas.find((f) => f.slot_id === "backend-sábado-10"); // 10:00-12:00
const vv = v.ventanaClase(f10);
assert.equal(vv.desdeMs, COTISO(SAB, "09:30")); assert.equal(vv.hastaMs, COTISO(SAB, "12:30"));
assert.equal(v.estadoClase(f10, COTISO(SAB, "09:29", "59"), { salaActiva: true }), "proxima", "justo antes de la ventana con sala: aun proxima (<=60 min)");
assert.equal(v.estadoClase(f10, COTISO(SAB, "09:30"), { salaActiva: true }), "abierta", "inicio de ventana inclusivo");
assert.equal(v.estadoClase(f10, COTISO(SAB, "09:30"), {}), "proxima", "ventana pero antes de iniciar y sin sala: proxima");
assert.equal(v.estadoClase(f10, COTISO(SAB, "10:15"), {}), "sin_sala");
assert.equal(v.estadoClase(f10, COTISO(SAB, "12:30"), { eventosEnVentana: 3 }), "abierta", "fin de ventana inclusivo");
assert.equal(v.estadoClase(f10, COTISO(SAB, "12:30", "01"), { eventosEnVentana: 3 }), "terminada");
assert.equal(v.estadoClase(f10, COTISO(SAB, "08:59"), {}), null, "a mas de 60 min no se muestra");
assert.equal(v.estadoClase(f10, COTISO(SAB, "09:00"), {}), "proxima", "exactamente 60 min");
assert.equal(v.estadoClase(f10, COTISO("2026-10-04", "10:00"), {}), null, "terminada de otro dia no se muestra");

// ---------- armarRespuestaVivo: escenarios completos
const sala = (uuid, host, topic, eventos, activo = true) => ({ uuid, host, topic, activo, eventos });
const arma = (salas, ahora, extra = {}) => v.armarRespuestaVivo({ semana: "2026-09-28", franjas, salas, rosterPorCorreo: roster, ahoraMs: ahora, ...extra });
const porSlot = (r, slot) => r.clases.find((c) => c.slot_id === slot);
{ // sabado: varias franjas simultaneas (3 a las 08:00) cada una con su sala
  const salas = [
    sala("u1", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "07:55"), ev("joined", rosterCorreos[1], "07:56"), ev("joined", "ext@ejemplo.test", "07:57")]),
    sala("u2", "jovenescreativos", "Backend: APIs y Base de Datos - Sala 2", [ev("joined", rosterCorreos[2], "07:58"), ev("joined", "docente@tocaunavida.org", "07:50")]),
    sala("u3", "desconocido", "Backend: APIs y Base de Datos - Avanzado", [ev("joined", rosterCorreos[3], "08:01")]),
  ];
  const r = arma(salas, COTISO(SAB, "08:10"));
  assert.deepEqual(r.clases.filter((c) => c.estado === "abierta").map((c) => c.slot_id).sort(),
    ["backend-sábado-08-avanzado", "backend-sábado-08-dos", "backend-sábado-08-uno"]);
  const uno = porSlot(r, "backend-sábado-08-uno"), dos = porSlot(r, "backend-sábado-08-dos"), av = porSlot(r, "backend-sábado-08-avanzado");
  assert.deepEqual([uno.roster_maximo, uno.desconocidos_maximo, uno.personal_maximo, uno.roster_total], [2, 1, 0, 50]);
  assert.deepEqual([dos.roster_maximo, dos.desconocidos_maximo, dos.personal_maximo], [1, 0, 1]);
  assert.equal(av.roster_maximo, 1, "host 'desconocido' de Soporte se resuelve por dia+hora+tipo Avanzado");
  assert.equal(av.cobertura_baja, false, "Soporte (admin con webhook, 2026-10-10) ya no marca cobertura baja por cuenta"); assert.equal(av.aviso, null);
  assert.equal(uno.cobertura_baja, false); assert.equal(uno.aviso, null);
  assert.equal(porSlot(r, "backend-sábado-10"), undefined, "la de las 10:00 empieza en 110 min: no se muestra");
}
{ // dos salas del mismo slot (sala reabierta): una persona en ambas = 1; saldo por persona sobre el conjunto
  const salas = [
    sala("a", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "07:55"), ev("left", rosterCorreos[0], "08:20"), ev("joined", rosterCorreos[1], "07:56")], false),
    sala("b", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "08:25"), ev("joined", rosterCorreos[2], "08:26")], true),
  ];
  const c = porSlot(arma(salas, COTISO(SAB, "08:30")), "backend-sábado-08-uno");
  assert.deepEqual([c.roster_maximo, c.roster_ahora_aprox, c.eventos, c.sala_activa], [3, 3, 5, true]);
}
{ // sala ajena (Taller/Charla/reunion semanal) no cuenta: el llamador filtra por esClase, y aqui tampoco se asocia si llegara
  const ajenas = ["MR: Taller De Bienestar", "Charla Primeros Auxilios", "Reunión semanal ROFÉ-UCC", "COM-Bases_De_Datos | Sofka"];
  assert.ok(ajenas.every((t) => !v.esClase(t)));
}
{ // clase proxima sin eventos (07:30 para la de 08:00: dentro de la ventana, antes de iniciar) y sin_sala (08:20 sin nada)
  const r = arma([], COTISO(SAB, "07:30"));
  assert.ok(r.clases.length === 3 && r.clases.every((c) => c.estado === "proxima" && c.roster_maximo === 0 && c.ultima_actividad === null));
  const r2 = arma([], COTISO(SAB, "08:20"));
  assert.ok(r2.clases.every((c) => c.estado === "sin_sala" && /no se encontró la sala/.test(c.aviso)));
}
{ // terminada: muestra el maximo final del dia; ahora_aprox sigue el saldo (los que no salieron quedan como aprox)
  const salas = [sala("a", "comunicaciones", "Backend: APIs y Base de Datos",
    [ev("joined", rosterCorreos[0], "08:01"), ev("joined", rosterCorreos[1], "08:02"), ev("left", rosterCorreos[0], "09:55")], false)];
  const c = porSlot(arma(salas, COTISO(SAB, "11:00")), "backend-sábado-08-uno");
  assert.deepEqual([c.estado, c.roster_maximo, c.roster_ahora_aprox, c.sala_activa], ["terminada", 2, 1, false]);
  // sin lectura de eventos y sin memoria: terminada con cero y aviso explicito
  const sin = porSlot(arma([], COTISO(SAB, "11:00"), { lecturaEventos: false }), "backend-sábado-08-uno");
  assert.match(sin.aviso, /Cifra final no disponible aquí; ver pestaña Presencia/);
  assert.deepEqual([sin.roster_maximo, sin.desconocidos_maximo, sin.personal_maximo, sin.eventos, sin.sala_activa], [0, 0, 0, 0, false]);
  // con memoria del dia y sin eventos: es un cero legitimo (nadie entro), sin aviso de cifra
  const cero = porSlot(arma([], COTISO(SAB, "11:00"), { lecturaEventos: true }), "backend-sábado-08-uno");
  assert.equal(cero.aviso, null);
}
{ // sin clase: dia sin franjas -> clases vacias, sin error
  const r = arma([], COTISO("2026-10-04", "10:00"));
  assert.deepEqual(r.clases, []); assert.equal(r.disponible, true);
}
{ // sala sin franja asignable (hora lejana): se avisa pero no se cuenta
  const salas = [sala("z", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "05:00")])];
  const r = arma(salas, COTISO(SAB, "08:10"));
  assert.match(r.aviso_general, /sin franja/);
  assert.equal(porSlot(r, "backend-sábado-08-uno").roster_maximo, 0);
}
{ // contrato: claves exactas y sin PII en la respuesta
  const salas = [sala("u1", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "08:01", { nombre: "Estudiante 001" })])];
  const r = arma(salas, COTISO(SAB, "08:10"));
  assert.deepEqual(Object.keys(r).sort(), ["actualizado_en", "aviso_general", "clases", "disponible", "hora_servidor", "semana"]);
  assert.deepEqual(Object.keys(r.clases[0]).sort(), ["aviso", "cobertura_baja", "cuenta_zoom", "desconocidos_ahora_aprox", "desconocidos_maximo", "estado", "etiqueta", "eventos",
    "fin", "inicio", "otra_franja_ahora_aprox", "otra_franja_maximo", "personal_ahora_aprox", "personal_maximo", "roster_ahora_aprox", "roster_maximo", "roster_total", "sala_activa", "slot_id", "ultima_actividad"]);
  assert.ok(!/ejemplo.test|Estudiante 0|@|persona_id/.test(JSON.stringify(r)));
}

// ---------- (1) roster por franja: «de ESTA clase» frente a «de otra franja»
const hashA = v.hashCorreo;
const rosterSlots = new Map(); // hash -> Set(slot_id)
const poner = (correo, ...slots) => rosterSlots.set(hashA(correo), new Set(slots));
rosterCorreos.slice(0, 5).forEach((c) => poner(c, "backend-sábado-08-uno"));        // 0..4 -> uno
rosterCorreos.slice(5, 9).forEach((c) => poner(c, "backend-sábado-08-dos"));        // 5..8 -> dos
poner(rosterCorreos[9], "backend-sábado-08-uno", "backend-sábado-10");               // en dos franjas, una es uno
{ const slotUno = "backend-sábado-08-uno";
  const e = [ev("joined", rosterCorreos[0], "08:01"), ev("joined", rosterCorreos[5], "08:02"), ev("joined", rosterCorreos[6], "08:03"),
    ev("left", rosterCorreos[6], "08:30"), ev("joined", rosterCorreos[9], "08:04"), ev("joined", "ext@ejemplo.test", "08:05")];
  const r = v.clasificarEventos(e, rosterSlots, COTISO(SAB, "09:00"), slotUno);
  assert.deepEqual([r.roster.maximo, r.roster.ahora], [2, 2], "uno: 0 y 9 (9 tambien esta en uno)");
  assert.deepEqual([r.otra.maximo, r.otra.ahora], [2, 1], "5 y 6 son de dos: visitan; 6 ya salio");
  assert.deepEqual([r.desconocidos.maximo], [1], "el externo es desconocido; los de otra franja NO se suman a desconocidos");
  const dos = v.clasificarEventos(e, rosterSlots, COTISO(SAB, "09:00"), "backend-sábado-08-dos");
  assert.deepEqual([dos.roster.maximo, dos.otra.maximo], [2, 2], "la misma lista vista desde dos: 5 y 6 propios; 0 y 9 visitan");
  // contrato legado: un Set (sin franjas) = todo el roster cuenta como de esta clase
  const legado = v.clasificarEventos(e, roster, COTISO(SAB, "09:00"), slotUno);
  assert.deepEqual([legado.roster.maximo, legado.otra.maximo], [4, 0]);
}
{ // sabado 08:00 uno y dos con roster por slot (salas distintas): cada una cuenta su roster; el alumno de dos que entra a la sala uno es otra_franja
  const salas = [
    sala("u1", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "07:55"), ev("joined", rosterCorreos[1], "07:56"), ev("joined", rosterCorreos[5], "07:57")]),
    sala("u2", "jovenescreativos", "Backend: APIs y Base de Datos - Sala 2", [ev("joined", rosterCorreos[5], "07:58"), ev("joined", rosterCorreos[6], "07:59"), ev("joined", rosterCorreos[0], "08:01")]),
  ];
  const r = v.armarRespuestaVivo({ semana: "2026-09-28", franjas, salas, rosterPorCorreo: rosterSlots, ahoraMs: COTISO(SAB, "08:10") });
  const uno = porSlot(r, "backend-sábado-08-uno"), dos = porSlot(r, "backend-sábado-08-dos");
  assert.deepEqual([uno.roster_maximo, uno.otra_franja_maximo, uno.otra_franja_ahora_aprox, uno.desconocidos_maximo], [2, 1, 1, 0]);
  assert.deepEqual([dos.roster_maximo, dos.otra_franja_maximo, dos.desconocidos_maximo], [2, 1, 0]);
  assert.ok(uno.roster_maximo <= uno.roster_total && dos.roster_maximo <= dos.roster_total, "roster_maximo <= roster_total");
}
{ // sala terminada: sala_activa false aunque la memoria la marque activa
  const salas = [sala("a", "comunicaciones", "Backend: APIs y Base de Datos", [ev("joined", rosterCorreos[0], "08:01")], true)];
  assert.equal(porSlot(arma(salas, COTISO(SAB, "11:00")), "backend-sábado-08-uno").sala_activa, false);
}

// ---------- (5) reloj: actualizado_en es el de la lectura, hora_servidor el de la respuesta
{ const r = arma([], COTISO(SAB, "08:10"), { actualizadoMs: COTISO(SAB, "08:09", "10") });
  assert.equal(r.actualizado_en, new Date(COTISO(SAB, "08:09", "10")).toISOString());
  assert.equal(r.hora_servidor, new Date(COTISO(SAB, "08:10")).toISOString());
}

// ---------- (7) nombres genericos sin correo: no colapsan; el mismo nombre normal sigue siendo una persona
{
  const claves = ["iPhone", "iphone", "Invitado", "Usuario", "Zoom User", "  ", null].map((nombre, i) => v.compactarEvento({ id: i + 1, evento: "joined", hora_ms: 1, nombre }).clave);
  assert.ok(claves.every((c) => c === null), "genericos y vacios: sin clave por nombre");
  assert.notEqual(v.compactarEvento({ id: 9, evento: "joined", hora_ms: 1, nombre: "Maria Perez" }).clave, null);
  const e = [ev("joined", null, "08:01", { nombre: "iPhone" }), ev("joined", null, "08:02", { nombre: "iPhone" }), ev("joined", null, "08:03", { nombre: "Invitado" }),
    ev("left", null, "08:20", { nombre: "iPhone" })];
  const r = cl(e);
  assert.deepEqual([r.desconocidos.maximo, r.desconocidos.ahora, r.lefts, r.huerfanos], [3, 2, 1, 0], "3 personas distintas; la salida descuenta al anonimo mas antiguo");
  const solo = cl([ev("left", null, "08:20", { nombre: "iPhone" })]);
  assert.deepEqual([solo.desconocidos.maximo, solo.huerfanos], [0, 1], "una salida anonima sin entrada es huerfana y NO crea persona");
  const dosNombres = cl([ev("joined", null, "08:01", { nombre: "Maria Perez" }), ev("joined", null, "08:02", { nombre: "maría  pérez" })]);
  assert.equal(dosNombres.desconocidos.maximo, 1, "dos personas con el MISMO nombre normal se cuentan como una (limite documentado)");
}

// ---------- (8) hash HMAC con secreto en memoria: estable dentro del proceso, distinto de un sha256 simple, nunca el texto
{ const { createHash } = await import("node:crypto");
  const h = v.hashClave("estudiante001@ejemplo.test");
  assert.equal(h, v.hashClave("estudiante001@ejemplo.test"));
  assert.notEqual(h, createHash("sha256").update("estudiante001@ejemplo.test").digest("hex").slice(0, 16), "no es un sha256 sin llave (no se puede reconstruir desde un diccionario de correos)");
  assert.match(h, /^[0-9a-f]{16}$/);
}
// ---------- (9) identidad como Lista en vivo (fase 1.4): correo del roster y, si no, cedula del registro de Zoom (sin ceros adelante)
{ const filasRoster = [
    { persona_id: "1000001", correo_norm: "estudiante001@ejemplo.test", slot_id: "backend-sábado-08-uno" },
    { persona_id: "1000002", correo_norm: "estudiante002@ejemplo.test", slot_id: "backend-sábado-08-uno" },
    { persona_id: "0001000003", correo_norm: "estudiante003@ejemplo.test", slot_id: "backend-sábado-08-dos" },
    { persona_id: "1000004", correo_norm: "estudiante004@ejemplo.test", slot_id: "backend-sábado-08-uno" },
    { persona_id: "1000004", correo_norm: "segundo004@ejemplo.test", slot_id: "backend-sábado-08-uno" }, // dos correos, una persona
  ];
  const registro = v.indexarRegistroVivo([
    { correo_norm: "personal001@ejemplo.test", cedula_digitos: "1000001" },     // correo fuera del roster, cedula del roster
    { correo_norm: "OTRO002@ejemplo.test ", cedula_digitos: "0001000002" },    // cedula del registro con ceros adelante
    { correo_norm: "visita003@ejemplo.test", cedula_digitos: "1000003" },      // roster con ceros, registro sin ellos; es de otra franja
    { correo_norm: "ajeno@ejemplo.test", cedula_digitos: "9999999" },          // cedula fuera del roster
    { correo_norm: "sincedula@ejemplo.test", cedula_digitos: null },
    { correo_norm: "doble@ejemplo.test", cedula_digitos: "1000004" }, { correo_norm: "doble@ejemplo.test", cedula_digitos: null }, // el ultimo CON cedula gana
  ]);
  const ident = v.conRegistro(v.indexarRosterVivo(filasRoster), registro);
  const slot = "backend-sábado-08-uno";
  const e = [ev("joined", "personal001@ejemplo.test", "08:01"), ev("joined", "otro002@ejemplo.test", "08:02"), ev("joined", "visita003@ejemplo.test", "08:03"),
    ev("joined", "ajeno@ejemplo.test", "08:04"), ev("joined", "sincedula@ejemplo.test", "08:05"), ev("joined", "doble@ejemplo.test", "08:06")];
  const r = v.clasificarEventos(e, ident, COTISO(SAB, "09:00"), slot);
  assert.deepEqual([r.roster.maximo, r.otra.maximo, r.desconocidos.maximo], [3, 1, 2], "1 y 2 por cedula (con o sin ceros), 4 por cedula; 3 visita; ajeno y sin cedula: desconocidos");
  // misma persona por correo del roster y por cedula del registro (o por sus dos correos del roster) = UNA persona
  const una = v.clasificarEventos([ev("joined", "estudiante001@ejemplo.test", "08:01"), ev("left", "estudiante001@ejemplo.test", "08:10"),
    ev("joined", "personal001@ejemplo.test", "08:11"), ev("joined", "estudiante004@ejemplo.test", "08:12"), ev("joined", "segundo004@ejemplo.test", "08:13")],
    ident, COTISO(SAB, "09:00"), slot);
  assert.deepEqual([una.roster.maximo, una.roster.ahora, una.huerfanos], [2, 2, 0], "persona 1 entra con dos correos; persona 4 con sus dos correos del roster");
  // sin registro: solo el correo identifica (el comportamiento anterior)
  const sin = v.clasificarEventos(e, v.conRegistro(v.indexarRosterVivo(filasRoster), null), COTISO(SAB, "09:00"), slot);
  assert.deepEqual([sin.roster.maximo, sin.desconocidos.maximo], [0, 6]);
  // personal sigue siendo personal aunque su correo tenga registro
  const pers = v.clasificarEventos([ev("joined", "monitor@tocaunavida.org", "08:01")], v.conRegistro(v.indexarRosterVivo(filasRoster),
    v.indexarRegistroVivo([{ correo_norm: "monitor@tocaunavida.org", cedula_digitos: "1000001" }])), COTISO(SAB, "09:00"), slot);
  assert.deepEqual([pers.personal.maximo, pers.roster.maximo], [1, 0]);
  assert.equal(v.cedulaSinCeros(" 00.123-4 "), "1234"); assert.equal(v.hashCedula("0001234"), v.hashCedula("1234")); assert.equal(v.hashCedula("000"), null);
  // privacidad: la identidad en memoria es solo hashes
  const dump = JSON.stringify([...ident.porCorreo, ...ident.porCedula, ...ident.registro, ...[...ident.slots.keys()]]);
  assert.ok(!/ejemplo|@|1000001|1000002/.test(dump), "sin correos ni cedulas en claro");
  // via armarRespuestaVivo
  const salas = [sala("u1", "comunicaciones", "Backend: APIs y Base de Datos", e)];
  const c = porSlot(v.armarRespuestaVivo({ semana: "2026-09-28", franjas, salas, rosterPorCorreo: ident, ahoraMs: COTISO(SAB, "08:10") }), slot);
  assert.deepEqual([c.roster_maximo, c.otra_franja_maximo, c.desconocidos_maximo], [3, 1, 2]);
}
console.log(`RESUMEN: vivo_calculo paridad_python=${par.casos.length}_casos(${coincidencias}_resueltos) es_clase=${Object.keys(par.es_clase).length} escenarios=verdes identidad_cedula=ok estado=verde`);
