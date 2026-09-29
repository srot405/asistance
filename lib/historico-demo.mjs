// Cifras agregadas (sin PII) de historico_semanal.py --dry-run, 2026-09-28, validacion 14/21-sep = 0,0 %.
// Regenerar con: python ../backend/etl/historico_semanal.py --desde 2026-07-27 --hasta 2026-09-21 --dry-run --salida <json>
// Las semanas de HTML/CSS (27-jul, 03-ago, 10-ago) se quitaron el 2026-09-29: ya
// no existen en asist_semana_resumen de producción (fuera del período que
// muestra el panel), así que tampoco deben aparecer en el fixture demo.
export const HISTORICO_DEMO = {
  "resultados": [
    {
      "semana": "2026-08-17",
      "materia": "JavaScript",
      "nivel": "Solo semanal",
      "poblacion": 747,
      "asistieron": 563,
      "nunca": 184,
      "porcentaje_retencion": 75.37,
      "porcentaje_nunca": 24.63,
      "clases_programadas": 14,
      "clases_capturadas": 10,
      "porcentaje_cobertura": 71.43,
      "captura_completa": false,
      "sabado_excluido": false,
      "aviso": "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase. mínimo (captura incompleta: 10 de 14 clases)",
      "metodo": "canon JC 2026 menos retiros previos",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 747,
        "medibles": 747,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 0
      },
      "detalle_dias": null,
      "detalle_clases": null,
      "no_identificados": 52,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    },
    {
      "semana": "2026-08-24",
      "materia": "JavaScript",
      "nivel": "Solo semanal",
      "poblacion": 743,
      "asistieron": 203,
      "nunca": 540,
      "porcentaje_retencion": 27.32,
      "porcentaje_nunca": 72.68,
      "clases_programadas": 14,
      "clases_capturadas": 4,
      "porcentaje_cobertura": 28.57,
      "captura_completa": false,
      "sabado_excluido": true,
      "aviso": "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase. mínimo (captura incompleta: 4 de 14 clases)",
      "metodo": "canon JC 2026 menos retiros previos",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 743,
        "medibles": 743,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 0
      },
      "detalle_dias": null,
      "detalle_clases": null,
      "no_identificados": 45,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    },
    {
      "semana": "2026-08-31",
      "materia": "JavaScript",
      "nivel": "Solo semanal",
      "poblacion": 740,
      "asistieron": 566,
      "nunca": 174,
      "porcentaje_retencion": 76.49,
      "porcentaje_nunca": 23.51,
      "clases_programadas": 14,
      "clases_capturadas": 6,
      "porcentaje_cobertura": 42.86,
      "captura_completa": false,
      "sabado_excluido": false,
      "aviso": "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase. mínimo (captura incompleta: 6 de 14 clases)",
      "metodo": "canon JC 2026 menos retiros previos",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 740,
        "medibles": 740,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 0
      },
      "detalle_dias": null,
      "detalle_clases": null,
      "no_identificados": 97,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    },
    {
      "semana": "2026-09-07",
      "materia": "JavaScript",
      "nivel": "Solo semanal",
      "poblacion": 726,
      "asistieron": 554,
      "nunca": 172,
      "porcentaje_retencion": 76.31,
      "porcentaje_nunca": 23.69,
      "clases_programadas": 14,
      "clases_capturadas": 7,
      "porcentaje_cobertura": 50.0,
      "captura_completa": false,
      "sabado_excluido": false,
      "aviso": "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase. mínimo (captura incompleta: 7 de 14 clases)",
      "metodo": "canon JC 2026 menos retiros previos",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 726,
        "medibles": 726,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 0
      },
      "detalle_dias": null,
      "detalle_clases": null,
      "no_identificados": 80,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    },
    {
      "semana": "2026-09-14",
      "materia": "Backend",
      "nivel": "Detalle",
      "poblacion": 726,
      "asistieron": 541,
      "nunca": 185,
      "porcentaje_retencion": 74.52,
      "porcentaje_nunca": 25.48,
      "clases_programadas": 14,
      "clases_capturadas": 14,
      "porcentaje_cobertura": 100.0,
      "captura_completa": true,
      "sabado_excluido": false,
      "aviso": "",
      "metodo": "roster congelado medible",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 726,
        "medibles": 726,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 0
      },
      "detalle_dias": [
        {
          "fecha": "2026-09-15",
          "poblacion": 50,
          "asistieron": 32,
          "nunca": 18,
          "porcentaje_retencion": 64.0,
          "porcentaje_nunca": 36.0
        },
        {
          "fecha": "2026-09-16",
          "poblacion": 56,
          "asistieron": 37,
          "nunca": 19,
          "porcentaje_retencion": 66.07,
          "porcentaje_nunca": 33.93
        },
        {
          "fecha": "2026-09-17",
          "poblacion": 99,
          "asistieron": 72,
          "nunca": 27,
          "porcentaje_retencion": 72.73,
          "porcentaje_nunca": 27.27
        },
        {
          "fecha": "2026-09-18",
          "poblacion": 53,
          "asistieron": 35,
          "nunca": 18,
          "porcentaje_retencion": 66.04,
          "porcentaje_nunca": 33.96
        },
        {
          "fecha": "2026-09-19",
          "poblacion": 468,
          "asistieron": 340,
          "nunca": 128,
          "porcentaje_retencion": 72.65,
          "porcentaje_nunca": 27.35
        }
      ],
      "detalle_clases": [
        {
          "fecha": "2026-09-15",
          "slot_id": "backend-martes-18",
          "poblacion": 50,
          "asistieron": 32,
          "nunca": 18,
          "porcentaje_retencion": 64.0,
          "porcentaje_nunca": 36.0
        },
        {
          "fecha": "2026-09-16",
          "slot_id": "backend-miércoles-18",
          "poblacion": 56,
          "asistieron": 37,
          "nunca": 19,
          "porcentaje_retencion": 66.07,
          "porcentaje_nunca": 33.93
        },
        {
          "fecha": "2026-09-17",
          "slot_id": "backend-jueves-10",
          "poblacion": 44,
          "asistieron": 35,
          "nunca": 9,
          "porcentaje_retencion": 79.55,
          "porcentaje_nunca": 20.45
        },
        {
          "fecha": "2026-09-17",
          "slot_id": "backend-jueves-16-avanzado",
          "poblacion": 55,
          "asistieron": 37,
          "nunca": 18,
          "porcentaje_retencion": 67.27,
          "porcentaje_nunca": 32.73
        },
        {
          "fecha": "2026-09-18",
          "slot_id": "backend-viernes-16",
          "poblacion": 53,
          "asistieron": 35,
          "nunca": 18,
          "porcentaje_retencion": 66.04,
          "porcentaje_nunca": 33.96
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-08-avanzado",
          "poblacion": 55,
          "asistieron": 44,
          "nunca": 11,
          "porcentaje_retencion": 80.0,
          "porcentaje_nunca": 20.0
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-08-dos",
          "poblacion": 52,
          "asistieron": 29,
          "nunca": 23,
          "porcentaje_retencion": 55.77,
          "porcentaje_nunca": 44.23
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-08-uno",
          "poblacion": 50,
          "asistieron": 47,
          "nunca": 3,
          "porcentaje_retencion": 94.0,
          "porcentaje_nunca": 6.0
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-10",
          "poblacion": 52,
          "asistieron": 44,
          "nunca": 8,
          "porcentaje_retencion": 84.62,
          "porcentaje_nunca": 15.38
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-10-avanzado",
          "poblacion": 50,
          "asistieron": 42,
          "nunca": 8,
          "porcentaje_retencion": 84.0,
          "porcentaje_nunca": 16.0
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-14-avanzado",
          "poblacion": 46,
          "asistieron": 28,
          "nunca": 18,
          "porcentaje_retencion": 60.87,
          "porcentaje_nunca": 39.13
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-14-uno",
          "poblacion": 52,
          "asistieron": 37,
          "nunca": 15,
          "porcentaje_retencion": 71.15,
          "porcentaje_nunca": 28.85
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-16-avanzado",
          "poblacion": 57,
          "asistieron": 40,
          "nunca": 17,
          "porcentaje_retencion": 70.18,
          "porcentaje_nunca": 29.82
        },
        {
          "fecha": "2026-09-19",
          "slot_id": "backend-sábado-16-uno",
          "poblacion": 54,
          "asistieron": 29,
          "nunca": 25,
          "porcentaje_retencion": 53.7,
          "porcentaje_nunca": 46.3
        }
      ],
      "no_identificados": 114,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    },
    {
      "semana": "2026-09-21",
      "materia": "Backend",
      "nivel": "Detalle",
      "poblacion": 258,
      "asistieron": 172,
      "nunca": 86,
      "porcentaje_retencion": 66.67,
      "porcentaje_nunca": 33.33,
      "clases_programadas": 5,
      "clases_capturadas": 5,
      "porcentaje_cobertura": 100.0,
      "captura_completa": true,
      "sabado_excluido": true,
      "aviso": "",
      "metodo": "roster congelado medible",
      "fuentes": [
        "asist_entradas",
        "asistencia_zoom",
        "zoom_live_log"
      ],
      "cuadre": {
        "roster": 726,
        "medibles": 258,
        "sin_dato": 0,
        "pendientes": 0,
        "sin_clase": 468
      },
      "detalle_dias": [
        {
          "fecha": "2026-09-22",
          "poblacion": 50,
          "asistieron": 30,
          "nunca": 20,
          "porcentaje_retencion": 60.0,
          "porcentaje_nunca": 40.0
        },
        {
          "fecha": "2026-09-23",
          "poblacion": 56,
          "asistieron": 42,
          "nunca": 14,
          "porcentaje_retencion": 75.0,
          "porcentaje_nunca": 25.0
        },
        {
          "fecha": "2026-09-24",
          "poblacion": 99,
          "asistieron": 71,
          "nunca": 28,
          "porcentaje_retencion": 71.72,
          "porcentaje_nunca": 28.28
        },
        {
          "fecha": "2026-09-25",
          "poblacion": 53,
          "asistieron": 26,
          "nunca": 27,
          "porcentaje_retencion": 49.06,
          "porcentaje_nunca": 50.94
        }
      ],
      "detalle_clases": [
        {
          "fecha": "2026-09-22",
          "slot_id": "backend-martes-18",
          "poblacion": 50,
          "asistieron": 30,
          "nunca": 20,
          "porcentaje_retencion": 60.0,
          "porcentaje_nunca": 40.0
        },
        {
          "fecha": "2026-09-23",
          "slot_id": "backend-miércoles-18",
          "poblacion": 56,
          "asistieron": 42,
          "nunca": 14,
          "porcentaje_retencion": 75.0,
          "porcentaje_nunca": 25.0
        },
        {
          "fecha": "2026-09-24",
          "slot_id": "backend-jueves-10",
          "poblacion": 44,
          "asistieron": 31,
          "nunca": 13,
          "porcentaje_retencion": 70.45,
          "porcentaje_nunca": 29.55
        },
        {
          "fecha": "2026-09-24",
          "slot_id": "backend-jueves-16-avanzado",
          "poblacion": 55,
          "asistieron": 40,
          "nunca": 15,
          "porcentaje_retencion": 72.73,
          "porcentaje_nunca": 27.27
        },
        {
          "fecha": "2026-09-25",
          "slot_id": "backend-viernes-16",
          "poblacion": 53,
          "asistieron": 26,
          "nunca": 27,
          "porcentaje_retencion": 49.06,
          "porcentaje_nunca": 50.94
        }
      ],
      "no_identificados": 22,
      "nunca_periodo": 52,
      "periodo_desde": "2026-07-27",
      "periodo_hasta": "2026-09-21"
    }
  ],
  "nunca_periodo": 52
};

// Semana real de nivel "Solo semanal" usada en capturas y pruebas de UX.
export const SOLO_SEMANAL_UX = {
  "semana": "2026-08-31",
  "materia": "JavaScript",
  "nivel": "Solo semanal",
  "poblacion": 740,
  "asistieron": 566,
  "nunca": 174,
  "porcentaje_retencion": 76.49,
  "porcentaje_nunca": 23.51,
  "clases_programadas": 14,
  "clases_capturadas": 6,
  "porcentaje_cobertura": 42.86,
  "captura_completa": false,
  "sabado_excluido": false,
  "aviso": "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase. mínimo (captura incompleta: 6 de 14 clases)",
  "metodo": "canon JC 2026 menos retiros previos",
  "fuentes": [
    "asist_entradas",
    "asistencia_zoom",
    "zoom_live_log"
  ],
  "cuadre": {
    "roster": 740,
    "medibles": 740,
    "sin_dato": 0,
    "pendientes": 0,
    "sin_clase": 0
  },
  "detalle_dias": null,
  "detalle_clases": null,
  "no_identificados": 97,
  "nunca_periodo": 52,
  "periodo_desde": "2026-07-27",
  "periodo_hasta": "2026-09-21"
};
