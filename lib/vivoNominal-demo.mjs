// Datos de EJEMPLO para "Lista en vivo" (TOC-153): personas 100 % sinteticas ("Persona Demo NN", correos @ejemplo.test).
// Se arman con el mismo calculo real (armarListaVivo) para que el demo ejercite la logica. Nada viene de produccion.
import { armarListaVivo } from "./vivoNominal.mjs";

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
const ev = (evento, hhmm, correo, nombre = null) => ({ id: id++, evento, ms: COT(hhmm), correo, nombre });
const sala08 = [];
for (const i of [1, 2, 4, 5, 6]) sala08.push(ev("joined", `08:0${i}`, `persona${i}@ejemplo.test`));
sala08.push(ev("joined", "08:05", "otrocorreo3@ejemplo.test"));          // identificada por cedula del registro
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
  ], roster, registrantes, ahoraMs: COT("10:45"), actualizadoMs: COT("10:45") });
