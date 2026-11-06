// Datos de EJEMPLO para "Lista en vivo" (TOC-153): personas 100 % sinteticas ("Persona Demo NN", correos @ejemplo.test).
// Se arman con el mismo calculo real (armarListaVivo) para que el demo ejercite la logica. Nada viene de produccion.
import { armarListaVivo } from "./vivoNominal.mjs";
import { asociarSalaJcon, etiquetaJcon, franjasJcon, PROGRAMA_JCON, rosterJcon } from "./vivoJcon.mjs";

const FECHA = "2026-10-10";
const SEMANA = "2026-10-05";
const COT = (hhmm) => Date.parse(`${FECHA}T${hhmm}:00-05:00`);
const franjas = [
  { slot_id: "backend-sábado-08", dia: "sábado", fecha: FECHA, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 8 },
  { slot_id: "backend-sábado-10", dia: "sábado", fecha: FECHA, hora_inicio: 10, hora_fin: 12, tipo: "Basico", cuenta_zoom: "jovenescreativos", roster_n: 8 },
  { slot_id: "backend-miércoles-18", dia: "miércoles", fecha: "2026-10-07", hora_inicio: 18, hora_fin: 20, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 4 },
];
const ciudades = ["Cali", "Bogotá", "Medellín", "Barranquilla"];
const roster = [];
for (let i = 1; i <= 20; i += 1) {
  const slot = i <= 8 ? "backend-sábado-08" : i <= 16 ? "backend-sábado-10" : "backend-miércoles-18";
  roster.push({ persona_id: String(1000000000 + i), correo_norm: `persona${i}@ejemplo.test`, nombre: `Persona Demo ${String(i).padStart(2, "0")}`,
    ciudad: ciudades[i % 4], slot_id: slot });
}
const registrantes = [
  { correo_norm: "otrocorreo3@ejemplo.test", cedula_digitos: "1000000003", nombre: "Persona Demo", apellido: "03 (registro)" },
  { correo_norm: "nuevo@ejemplo.test", cedula_digitos: "1099999999", nombre: "Registrado", apellido: "Sin Roster" },
];
let id = 1;
const ev = (evento, hhmm, correo, nombre = null, registrant_id = null) => ({ id: id++, evento, ms: COT(hhmm), correo, nombre, registrant_id });
// registro de Zoom buscado por el registrant_id del webhook (TOC-153 paso 2)
const registrantesPorId = [
  { registrant_id: "demo-rid-08", correo_norm: "registro8@ejemplo.test", cedula_digitos: "1000000008", nombre: "Persona Demo", apellido: "08 (registro)" },
];
const sala08 = [];
for (const i of [1, 2, 4, 5, 6]) sala08.push(ev("joined", `08:0${i}`, `persona${i}@ejemplo.test`));
sala08.push(ev("joined", "08:05", "otrocorreo3@ejemplo.test"));          // identificada por cedula del registro
sala08.push(ev("joined", "08:06", "celular8@ejemplo.test", null, "demo-rid-08")); // identificada por el registrant_id del registro
sala08.push(ev("joined", "08:07", "persona17@ejemplo.test"));            // es del miercoles: otra franja
sala08.push(ev("joined", "08:10", null, "Invitado Fulano"));             // sin correo
sala08.push(ev("joined", "08:00", "monitor@tocaunavida.org"));           // personal
sala08.push(ev("left", "09:50", "persona2@ejemplo.test"));
for (const i of [1, 4, 5, 6]) sala08.push(ev("left", "10:00", `persona${i}@ejemplo.test`));
const sala10 = [];
for (const i of [9, 10, 11, 12, 13]) sala10.push(ev("joined", `10:0${i - 8}`, `persona${i}@ejemplo.test`));
sala10.push(ev("joined", "10:12", "persona7@ejemplo.test"));             // del sabado 8: otra franja
sala10.push(ev("joined", "10:15", "nuevo@ejemplo.test"));                // registro con cedula fuera del roster
sala10.push(ev("joined", "10:20", "desconocido@ejemplo.test"));          // sin registro ni roster
sala10.push(ev("joined", "10:01", null, "Fireflies.ai Notetaker"));     // bot -> personal
sala10.push(ev("left", "10:40", "persona13@ejemplo.test"));

export const LISTA_VIVO_DEMO = armarListaVivo({ semana: SEMANA, franjasHoy: franjas.filter((f) => f.fecha === FECHA), franjasSemana: franjas,
  salas: [
    { uuid: "demo-08", host: "comunicaciones@ejemplo.test", topic: "Backend: APIs y Base de Datos", activo: false, eventos: sala08 },
    { uuid: "demo-10", host: "jovenescreativos@ejemplo.test", topic: "Backend: APIs y Base de Datos", activo: true, eventos: sala10 },
  ], roster, registrantes, registrantesPorId, ahoraMs: COT("10:45"), actualizadoMs: COT("10:45") });

// TOC-208: JC-ON (programa aparte de JC), mismo dia de ejemplo, clase del grupo S (sabado 14:00-16:00) en curso a las 14:30. Roster
// sintetico con el formato de jcon.estudiantes; se arma con el MISMO calculo real que usa el servidor (franjas sinteticas, sala por tema).
const rosterJconDemo = rosterJcon(Array.from({ length: 10 }, (_, k) => ({ cedula: String(2000000000 + k + 1), email: `jcon${k + 1}@ejemplo.test`,
  nombres: "Egresada Demo", apellidos: String(k + 1).padStart(2, "0"), horario: k < 5 ? "manana" : "tarde", estado: "activo", grupo_ciudad: ciudades[k % 4] })));
const franjasJconDemo = franjasJcon(SEMANA, rosterJconDemo.n);
const salaJcon = [];
for (const k of [6, 7, 8]) salaJcon.push(ev("joined", `14:0${k - 5}`, `jcon${k}@ejemplo.test`));      // grupo S en su clase
salaJcon.push(ev("joined", "14:05", "celular9@ejemplo.test", null, "demo-rid-jcon9"));                // identificada por registrant_id
salaJcon.push(ev("joined", "14:06", "jcon2@ejemplo.test"));                                            // grupo V: colada
salaJcon.push(ev("joined", "14:08", "persona1@ejemplo.test"));                                         // es de JC, no de JC-ON: no identificada
salaJcon.push(ev("joined", "14:00", "monitor@tocaunavida.org"));                                       // personal
salaJcon.push(ev("left", "14:25", "jcon8@ejemplo.test"));
export const LISTA_VIVO_DEMO_JCON = armarListaVivo({ semana: SEMANA, franjasHoy: franjasJconDemo.filter((f) => f.fecha === FECHA), franjasSemana: franjasJconDemo,
  salas: [{ uuid: "demo-jcon-s", host: "jovenescreativos@ejemplo.test", topic: "Sesión JCON2 - Sábado 2:00 p.m. - 4:00 p.m.", activo: true, eventos: salaJcon }],
  roster: rosterJconDemo.filas, registrantes: [],
  registrantesPorId: [{ registrant_id: "demo-rid-jcon9", correo_norm: "registro-jcon9@ejemplo.test", cedula_digitos: "2000000009", nombre: "Egresada Demo", apellido: "09 (registro)" }],
  ahoraMs: COT("14:30"), actualizadoMs: COT("14:30"), asociar: asociarSalaJcon, etiquetar: etiquetaJcon, programa: PROGRAMA_JCON });
