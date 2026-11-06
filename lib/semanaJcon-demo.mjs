// Fixture SINTETICO de JC-ON para la pestana «Semana» en modo demo (TOC-208 fase 2). Mismo formato que jcon.estudiantes/clases/asistencia.
// Nombres «Egresada Demo NN», cedulas 30000000NN: nada real. Bienvenida (B1 martes = V, B2 jueves = S) y Semana 1 con el viernes cargado y
// el sabado aun sin fila en jcon.clases (sale pendiente). HOY_DEMO fijo para que la demo no cambie con el reloj.
export const HOY_DEMO_JCON = "2026-11-06";
const ciudades = ["CAL", "MED", "BOG", "BAQ", "CTG"];
export const DATOS_DEMO_JCON = Object.freeze({
  estudiantes: Array.from({ length: 12 }, (_, k) => ({ id: 900 + k, cohorte_jcon: "2026", cedula: String(3000000000 + k + 1),
    nombres: "Egresada Demo", apellidos: String(k + 1).padStart(2, "0"), horario: k < 6 ? "manana" : "tarde",
    estado: k === 11 ? "retirado" : "activo", grupo_ciudad: ciudades[k % ciudades.length] })),
  clases: [
    { id: 1, cohorte_jcon: "2026", fecha: "2026-10-27", horario: "manana", tema: "Bienvenida B1", tipo: "bienvenida", numero_semana: null },
    { id: 2, cohorte_jcon: "2026", fecha: "2026-10-27", horario: "tarde", tema: "Bienvenida B1", tipo: "bienvenida", numero_semana: null },
    { id: 3, cohorte_jcon: "2026", fecha: "2026-10-29", horario: "manana", tema: "Bienvenida B2", tipo: "bienvenida", numero_semana: null },
    { id: 4, cohorte_jcon: "2026", fecha: "2026-10-29", horario: "tarde", tema: "Bienvenida B2", tipo: "bienvenida", numero_semana: null },
    { id: 5, cohorte_jcon: "2026", fecha: "2026-11-06", horario: "manana", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
  ],
  asistencia: [
    // Bienvenida. Grupo V (900-905): 900-902 en su sala B1; 903-904 solo en B2 (colados); 905 nunca. 900 tambien entro a B2.
    ...[900, 901, 902].map((id) => ({ clase_id: 1, estudiante_id: id, asistio: true, fuente: "sheet-zoom" })),
    ...[900, 903, 904].map((id) => ({ clase_id: 3, estudiante_id: id, asistio: true, fuente: "sheet-zoom-visita" })),
    // Grupo S (906-910 activos, 911 retirado): 906-908 en su sala B2; 909 solo en B1; 910 nunca; el retirado se colo en B1 (no cuenta).
    ...[906, 907, 908].map((id) => ({ clase_id: 4, estudiante_id: id, asistio: true, fuente: "sheet-zoom" })),
    ...[909, 911].map((id) => ({ clase_id: 2, estudiante_id: id, asistio: true, fuente: "sheet-zoom-visita" })),
    // Semana 1, viernes (grupo V): 900-903 en su sala.
    ...[900, 901, 902, 903].map((id) => ({ clase_id: 5, estudiante_id: id, asistio: true, fuente: "sheet-zoom" })),
  ],
});
