import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Analisis estatico del TSX/CSS nuevo (no se puede abrir la UI autenticada en CI).
const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");
const NUEVOS = ["Tiempo", "TiempoTarjetas", "TiempoTablaClases", "CoberturaTiempo", "HistogramaTiempo", "LeyendaTiempo", "TendenciaTiempo"];
const fuentes = Object.fromEntries(await Promise.all(NUEVOS.map(async (n) => [n, await leer(`components/${n}.tsx`)])));

// 1) ningun componente nuevo toca nombre/correo/persona_id
for (const [n, src] of Object.entries(fuentes)) assert.doesNotMatch(src, /persona_id|correo|\.nombre\b|\bnombre\s*[:=]/, `${n}.tsx no usa nombre/correo/persona_id`);
// 2) "con tiempo medido" literal en CoberturaTiempo (y N de M siempre visible en las cifras)
assert.match(fuentes.CoberturaTiempo, /con tiempo medido/);
assert.match(fuentes.CoberturaTiempo, /textoCobertura\(conteos\)/);
assert.match(fuentes.Tiempo, /<CoberturaTiempo /);
assert.match(await leer("components/ResumenSemanaVisual.tsx"), /textoCobertura\(t\.semana_agregada\)/, "la tarjeta de Semana lleva N de M");
assert.match(fuentes.TendenciaTiempo, /con tiempo medido/);
// 3) "Sin dato de tiempo" se define UNA sola vez (tiempoVista.mjs); los componentes usan ETIQUETAS
const vista = await leer("lib/tiempoVista.mjs");
assert.equal((vista.match(/Sin dato de tiempo/g) ?? []).length, 1);
for (const [n, src] of Object.entries(fuentes)) assert.equal(src.includes("Sin dato de tiempo"), false, `${n}.tsx usa ETIQUETAS, no el literal`);
// 4) cada categoria = icono + texto (no solo color): la leyenda y las tarjetas usan ICONOS y ETIQUETAS
assert.match(fuentes.LeyendaTiempo, /ICONOS\[k\]/);
assert.match(fuentes.LeyendaTiempo, /ETIQUETAS\[k\]/);
for (const icono of ["cumple", "rojo_tiempo", "sin_dato_tiempo"]) assert.match(fuentes.TiempoTarjetas, new RegExp(`ICONOS\\.${icono}`), `tarjeta ${icono} con icono`);
assert.match(fuentes.TiempoTarjetas, /ETIQUETAS\.sin_dato_tiempo/);
for (const [k, icono] of [["cumple", "✓"], ["rojo_tiempo", "⏱"], ["no_ingreso", "✕"], ["sin_dato_tiempo", "◌"]]) assert.match(vista, new RegExp(`${k}: "${icono}"`));
assert.match(fuentes.Tiempo, /<LeyendaTiempo \/>/, "la leyenda esta siempre en la pestana");
// 5) accesibilidad: aria-label en el histograma, las filas y la tendencia; tabla sr-only equivalente
assert.match(fuentes.HistogramaTiempo, /aria-label=/);
assert.match(fuentes.HistogramaTiempo, /className="sr-only"/);
assert.match(fuentes.TiempoTablaClases, /aria-label=\{aria\}/);
assert.match(fuentes.TendenciaTiempo, /aria-label=\{p\.graficable/);
assert.match(fuentes.Tiempo, /aria-live="polite"/);
// 6) linea de corte en 50 y trama diagonal en el lado rojo
assert.match(fuentes.HistogramaTiempo, /histograma\.corte/);
assert.match(fuentes.HistogramaTiempo, /patternTransform="rotate\(45\)"/);
// 7) CSS: rojo por tiempo (trama diagonal) distinto de no ingreso (liso) y de sin dato (punteado), claro y oscuro
const css = await leer("app/globals.css");
assert.equal((css.match(/--t-rojo:/g) ?? []).length, 2, "token rojo por tiempo en claro y oscuro");
assert.match(css, /\.t-muestra\.t-rojo \{ background: repeating-linear-gradient\(45deg/);
assert.match(css, /\.t-muestra\.t-noingreso \{ background: var\(--t-noentro\); \}/);
assert.match(css, /\.t-muestra\.t-sindato \{[^}]*dotted/);
assert.match(css, /@media \(max-width: 600px\) \{ \.tiempo-grid \{ grid-template-columns: 1fr;/);
// 8) degradacion: sin tablas se muestra el texto fijo y las otras pestanas siguen igual
assert.match(fuentes.Tiempo, /TEXTO_NO_DISPONIBLE/);
assert.match(fuentes.TendenciaTiempo, /TEXTO_NO_DISPONIBLE/);
const dash = await leer("components/Dashboard.tsx");
assert.match(dash, /\["Semana", "En vivo", "Lista en vivo", "Presencia", "Cobertura", "Tiempo", "Estadísticas", "Historial"]/);
for (const comp of ["<Presencia ", "<Cobertura ", "<CalendarioSemana ", "<TendenciaHistorica "]) assert.ok(dash.includes(comp), `${comp} sigue`);
// 9) TOC-146: Presencia usa el criterio unico del 50 % de Tiempo (sin 70 %, sin "Entró y salió")
const presenciaSrc = await leer("components/Presencia.tsx");
assert.match(presenciaSrc, /mismo criterio de la pestaña <b>Tiempo<\/b>: el 50 % del tiempo/);
assert.doesNotMatch(presenciaSrc, /70\s*(&nbsp;)?\s*%|Entró y salió|entro_y_salio/, "Presencia sin 70 % ni vocabulario viejo");
assert.match(presenciaSrc, /Parcial[\s\S]*Sin dato de tiempo/);
// 10) el servidor es el unico punto de acople: ningun componente importa lib/servidor ni supabase
for (const [n, src] of Object.entries(fuentes)) assert.doesNotMatch(src, /lib\/servidor|supabase/, `${n}.tsx no toca el servidor`);
// 11) ningun umbral absoluto en minutos en el codigo nuevo
for (const archivo of ["lib/tiempoVista.mjs", "lib/tiempoCalculo.mjs", "lib/histogramaTiempo.mjs", "lib/tendenciaTiempo.mjs", "lib/servidor/leerTiempo.ts"]) {
  const src = await leer(archivo);
  assert.doesNotMatch(src, /3600|60 min|minutos\s*[<>]=?\s*60/, `${archivo}: sin umbral absoluto de 60 min`);
}
assert.equal((vista.match(/UMBRAL_PORCENTAJE_ROJO = 50;/g) ?? []).length, 1, "el 50 vive en UNA constante");
// 12) TOC-147: la pestaña monta «Entró a clase ajena»; el componente suprime con «<5», no toca el servidor y no inventa nombres
assert.match(await leer("components/Tiempo.tsx"), /<TiempoVisitas semana=\{actual\.semana\} filtro=\{filtro\} modo=\{modo\} \/>/);
const visitasSrc = await leer("components/TiempoVisitas.tsx");
assert.match(visitasSrc, /TEXTO_SUPRIMIDO/); assert.match(visitasSrc, /Sin identificar/); assert.match(visitasSrc, /data-testid="visitas-vacio"/);
assert.doesNotMatch(visitasSrc, /lib\/servidor|supabase/);
console.log("RESUMEN: tiempo_ui=ok sin_pii=ok icono_mas_texto=ok aria=ok leyenda_fija=ok trama_rojo=ok degradado=ok presencia_aviso=ok estado=verde");
