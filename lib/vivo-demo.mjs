// Datos de EJEMPLO para la pestana "En vivo" (TOC-142). Solo conteos; nada viene de produccion.
// Sabado 2026-10-10, hora de Colombia (-05:00). Respetan el contrato de GET /api/vivo.
const SEMANA = "2026-10-05";
const clase = (o) => ({
  slot_id: "ejemplo-1800", etiqueta: "comunicaciones", cuenta_zoom: "Comunicaciones",
  inicio: "2026-10-10T18:00:00-05:00", fin: "2026-10-10T20:00:00-05:00", estado: "abierta", sala_activa: true,
  roster_total: 40, roster_maximo: 31, roster_ahora_aprox: 27, desconocidos_maximo: 3, desconocidos_ahora_aprox: 2,
  personal_maximo: 2, personal_ahora_aprox: 2, ultima_actividad: "2026-10-10T18:19:40-05:00", eventos: 118,
  cobertura_baja: false, aviso: null, ...o,
});
const resp = (hora, clases, extra = {}) => ({
  disponible: true, actualizado_en: hora, semana: SEMANA, hora_servidor: hora, clases, aviso_general: null, ...extra,
});
const AHORA = "2026-10-10T18:20:00-05:00";

export const VIVO_DEMO = Object.freeze({
  en_curso: resp(AHORA, [clase({})]),
  cobertura_baja: resp(AHORA, [clase({
    slot_id: "ejemplo-soporte-1800", etiqueta: "soporte", cuenta_zoom: "Soporte", roster_total: 35, roster_maximo: 12,
    roster_ahora_aprox: 9, desconocidos_maximo: 6, desconocidos_ahora_aprox: 5, personal_maximo: 1, personal_ahora_aprox: 1,
    eventos: 41, cobertura_baja: true,
    aviso: "Zoom no entregó todas las entradas de esta sala; el conteo es un mínimo.",
  })]),
  sabado: resp("2026-10-10T10:05:00-05:00", [
    clase({ slot_id: "ejemplo-0800", etiqueta: "programación", cuenta_zoom: "Programación", inicio: "2026-10-10T08:00:00-05:00",
      fin: "2026-10-10T10:00:00-05:00", estado: "terminada", sala_activa: false, roster_total: 45, roster_maximo: 38,
      roster_ahora_aprox: 0, desconocidos_maximo: 1, desconocidos_ahora_aprox: 0, personal_maximo: 2, personal_ahora_aprox: 0 }),
    clase({ slot_id: "ejemplo-1000a", etiqueta: "diseño", cuenta_zoom: "Diseño", inicio: "2026-10-10T10:00:00-05:00",
      fin: "2026-10-10T12:00:00-05:00", roster_total: 30, roster_maximo: 22, roster_ahora_aprox: 20, desconocidos_maximo: 2,
      desconocidos_ahora_aprox: 2, personal_maximo: 1, personal_ahora_aprox: 1 }),
    clase({ slot_id: "ejemplo-1000b", etiqueta: "comunicaciones", cuenta_zoom: "Comunicaciones", inicio: "2026-10-10T10:00:00-05:00",
      fin: "2026-10-10T12:00:00-05:00", roster_total: 40, roster_maximo: 31, roster_ahora_aprox: 27 }),
    clase({ slot_id: "ejemplo-1000c", etiqueta: "datos", cuenta_zoom: "Datos", inicio: "2026-10-10T10:00:00-05:00",
      fin: "2026-10-10T12:00:00-05:00", roster_total: 28, roster_maximo: 9, roster_ahora_aprox: 9, desconocidos_maximo: 0,
      desconocidos_ahora_aprox: 0, personal_maximo: 1, personal_ahora_aprox: 1 }),
    clase({ slot_id: "ejemplo-1400", etiqueta: "marketing", cuenta_zoom: "Marketing", inicio: "2026-10-10T14:00:00-05:00",
      fin: "2026-10-10T16:00:00-05:00", estado: "proxima", sala_activa: false, roster_total: 33, roster_maximo: 0,
      roster_ahora_aprox: 0, desconocidos_maximo: 0, desconocidos_ahora_aprox: 0, personal_maximo: 0, personal_ahora_aprox: 0,
      ultima_actividad: null, eventos: 0 }),
  ]),
  proxima: resp("2026-10-10T17:30:00-05:00", [clase({ estado: "proxima", sala_activa: false, roster_maximo: 0,
    roster_ahora_aprox: 0, desconocidos_maximo: 0, desconocidos_ahora_aprox: 0, personal_maximo: 0, personal_ahora_aprox: 0,
    ultima_actividad: null, eventos: 0 })]),
  terminada: resp("2026-10-10T20:30:00-05:00", [clase({ estado: "terminada", sala_activa: false, roster_ahora_aprox: 0,
    desconocidos_ahora_aprox: 0, personal_ahora_aprox: 0, ultima_actividad: "2026-10-10T19:58:00-05:00", eventos: 236 })]),
  sin_clase: resp("2026-10-10T22:45:00-05:00", []),
});

export const VIVO_DEMO_503 = Object.freeze({ status: 503, body: Object.freeze({ disponible: false }) });
