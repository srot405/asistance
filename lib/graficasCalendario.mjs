// Cálculo puro de las gráficas del calendario (TOC-91, plan colados + gráficas 2026-10-12). Solo REORDENA lo que ya
// trae /api/detalle (porDia / porClase, campos horario/colados/ambos de camposIngreso en lib/detalleCalculo.mjs):
// no cuenta nada por su cuenta, así las cifras del gráfico son por construcción las mismas de las tablas. Sin I/O ni
// nombres: vive en .mjs para que scripts/test-graficas-calendario.mjs lo corra bajo Node (patrón de tendenciaGrafico).

// Qué series se dibujan según el filtro del calendario. "ambos" = horario + colados + línea total (sumados).
export const SERIES_POR_MODO = {
  horario: ["horario"],
  colados: ["colados"],
  ambos: ["horario", "colados", "ambos"],
};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Semana abierta = los colados aún pueden crecer (alguien de un día ya pasado todavía puede entrar a otra clase).
// cerrada_en === null es la señal explícita del backend (asist_semanas.cerrada_en, TOC-140); undefined = dato
// ausente (demo o columna no cargada) y entonces solo cuenta si alguna clase sigue en curso (resumen.en_curso).
export function semanaAbierta(cerradaEn, resumen) {
  return cerradaEn === null || Boolean(resumen?.en_curso);
}

// Un punto por día de clase (porDia ya viene ordenado por fecha). Un día sin el campo (respuesta vieja) da null,
// nunca 0: el componente no lo dibuja.
export function puntosSemana(porDia) {
  return (porDia ?? []).map((d, indice) => ({
    indice, fecha: d.fecha, poblacion: d.poblacion,
    horario: num(d.horario), colados: num(d.colados), ambos: num(d.ambos),
    porcentaje_horario: num(d.porcentaje_horario), porcentaje_colados: num(d.porcentaje_colados),
    porcentaje_ambos: num(d.porcentaje_ambos), en_curso: Boolean(d.en_curso),
  }));
}

// Barras de un día: una por clase. `fondo` = roster medible (poblacion). Segmentos apilados desde 0 según el filtro:
// horario = solo azul; colados = solo amarillo (desde la base); ambos = azul y encima amarillo.
export function barrasDia(porClase, fecha, modo) {
  return (porClase ?? []).filter((c) => c.fecha === fecha).map((c) => {
    const horario = num(c.horario) ?? 0, colados = num(c.colados) ?? 0;
    const segmentos = [];
    if (modo !== "colados") segmentos.push({ tipo: "horario", desde: 0, hasta: horario });
    if (modo !== "horario") {
      const base = modo === "ambos" ? horario : 0;
      segmentos.push({ tipo: "colados", desde: base, hasta: base + colados });
    }
    const visible = modo === "horario" ? horario : modo === "colados" ? colados : horario + colados;
    return { slot_id: c.slot_id ?? "", fecha: c.fecha, poblacion: c.poblacion, horario, colados,
      ambos: num(c.ambos) ?? horario + colados, visible, segmentos, en_curso: Boolean(c.en_curso) };
  });
}

// Techo "redondo" del eje Y de las barras (personas): pasos cortos para no desperdiciar alto. Nunca 0 (evita división por cero).
export function techoEje(maximo) {
  const m = Math.max(1, Math.ceil(maximo || 0));
  const pot = 10 ** Math.floor(Math.log10(m));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * pot >= m) return f * pot;
  return 10 * pot;
}

// Marcas del eje Y: 0, ¼, ½, ¾ y el techo (enteras).
export function marcasEje(techo) {
  return [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(techo * f)))];
}

// Vista semana en % del roster medible de cada día (el sábado tiene ~9 veces el roster de un día entre semana: en
// personas aplastaría la forma del resto). Es el mismo % que muestra la celda del calendario (porcentaje_* de porDia).
// Un día en curso no tiene % final (fase 1.7, ver vista() en CalendarioSemana.tsx): null = no se dibuja.
const CAMPO_PCT = { horario: "porcentaje_horario", colados: "porcentaje_colados", ambos: "porcentaje_ambos" };
export function valorPunto(punto, serie) {
  return punto.en_curso ? null : punto[CAMPO_PCT[serie]] ?? null;
}

// Máximo visible de la vista día: el fondo (roster) manda.
export function maximoDia(barras) {
  return Math.max(0, ...barras.map((b) => Math.max(b.poblacion ?? 0, b.horario + b.colados)));
}

// ¿Se dibujan los colados como provisionales (trama/borde punteado)? Solo si se muestran y la semana sigue abierta.
export function coladosProvisionales(modo, abierta) {
  return Boolean(abierta) && modo !== "horario";
}
