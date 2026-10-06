import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderizar } from "./render-componente.mjs";
import { VIVO_DEMO } from "../lib/vivo-demo.mjs";

const P = "components/EnVivoPantalla.tsx";
const ver = (datos, extra = {}) => renderizar(P, { fase: "ok", datos, edadSeg: 12, reintentar() {}, ...extra });
const verHtml = (datos, extra = {}) => renderizar(P, { fase: "ok", datos, edadSeg: 12, reintentar() {}, ...extra }, { html: true });
const capturas = {};

// 1) Clase en curso normal
{ const t = await ver(VIVO_DEMO.en_curso); capturas.en_curso = t;
  for (const s of ["Clase de las 18:00 · comunicaciones", "● En curso", "Del roster: 31 de 40", "ahora en sala (aprox.): 27",
    "No sabemos quién es: 3", "Personal: 2", "Actualizado hace 12 s", "Cuenta Zoom: Comunicaciones"]) assert.ok(t.includes(s), `falta «${s}»: ${t}`);
  assert.ok(!t.includes("El conteo puede estar por debajo"), "sin banda si la cobertura es buena");
  assert.ok(!t.includes("Cifra final del webhook"), "en curso no es cifra final");
  const h = await verHtml(VIVO_DEMO.en_curso);
  assert.match(h, /role="progressbar"[^>]*aria-valuenow="31"[^>]*aria-valuemax="40"|aria-valuemax="40"[^>]*aria-valuenow="31"/, "barra de progreso accesible");
  assert.match(h, /aria-label="Del roster: 31 de 40"/);
  assert.match(h, /style="width:78%"/, "barra al 78 %");
  assert.match(h, /title="Personas que entraron a Zoom[^"]*correos mal escritos: se corrigen al cerrar la clase\."/, "tooltip de No sabemos quién es");
}

// 2) Cobertura baja (Soporte)
{ const t = await ver(VIVO_DEMO.cobertura_baja); capturas.cobertura_baja = t;
  assert.ok(t.includes("El conteo puede estar por debajo de la realidad (Zoom perdió entradas en esta sala)"));
  assert.ok(t.includes("Zoom no entregó todas las entradas de esta sala; el conteo es un mínimo."), "muestra el aviso");
  assert.ok(t.includes("⚠"), "icono, no solo color");
  assert.ok(t.includes("Cuenta Zoom: Soporte"));
  assert.ok(t.includes("Del roster: 12 de 35"));
}

// 3) Sabado: 3 clases a la vez
{ const t = await ver(VIVO_DEMO.sabado); capturas.sabado = t;
  const h = await verHtml(VIVO_DEMO.sabado);
  assert.equal((h.match(/<article /g) ?? []).length, 5, "una tarjeta por clase (3 en curso + 1 proxima + 1 terminada)");
  assert.equal((h.match(/data-estado="abierta"/g) ?? []).length, 3);
  for (const s of ["Clase de las 10:00 · diseño", "Clase de las 10:00 · comunicaciones", "Clase de las 10:00 · datos", "Clase de las 14:00 · marketing", "Clase de las 08:00 · programación"])
    assert.ok(t.includes(s), s);
  assert.ok(h.indexOf("data-estado=\"terminada\"") > h.indexOf("data-estado=\"proxima\""), "terminada al final");
  assert.ok(!t.includes("No hay clase en este momento"), "con clases en curso no aparece el vacio");
}

// 4) Proxima
{ const t = await ver(VIVO_DEMO.proxima); capturas.proxima = t;
  assert.ok(t.includes("◷ Próxima"));
  assert.ok(t.includes("No hay clase en este momento"));
  assert.ok(t.includes("Próxima clase de hoy: Clase de las 18:00 · comunicaciones (empieza a las 18:00)"));
  assert.ok(t.includes("Todavía no empieza. Roster de esta clase: 40 personas."));
  assert.ok(!t.includes("Del roster:"), "proxima: sin burbujas en cero");
}

// 5) Terminada
{ const t = await ver(VIVO_DEMO.terminada); capturas.terminada = t;
  assert.ok(t.includes("✔ Terminada"));
  assert.ok(t.includes("Del roster: 31 de 40"), "muestra el maximo final");
  assert.ok(t.includes("Cifra final del webhook; el cierre oficial lo calcula el sistema."));
  assert.ok(!t.includes("ahora en sala (aprox.): 0"), "terminada no muestra 'ahora'");
  assert.ok(t.includes("No hay clase en este momento"));
}

// 6) Sin clase
{ const t = await ver(VIVO_DEMO.sin_clase); capturas.sin_clase = t;
  assert.ok(t.includes("No hay clase en este momento"));
  assert.ok(!t.includes("Próxima clase de hoy"), "sin proxima no inventa una");
  assert.ok(!t.includes("Clase de las"), "sin tarjetas");
}

// 7) No disponible (503): mensaje corto, sin detalles ni cifras
{ const t = await renderizar(P, { fase: "no_disponible", datos: null, edadSeg: 0, reintentar() {} }); capturas.no_disponible = t;
  assert.ok(t.includes("En vivo no disponible"));
  assert.doesNotMatch(t, /HTTP|503|supabase|error|stack|Actualizado hace/i, "sin detalles internos");
  assert.ok(!t.includes("Del roster"));
}

// 8) Cargando, error y pausa con Reintentar
{ const t = await renderizar(P, { fase: "cargando", datos: null, edadSeg: 0, reintentar() {} }); capturas.cargando = t;
  assert.ok(t.includes("Cargando En vivo"));
  const p = await renderizar(P, { fase: "pausado", datos: VIVO_DEMO.en_curso, edadSeg: 95, fallo: true, reintentar() {} }); capturas.pausado = p;
  assert.ok(p.includes("falló tres veces seguidas") && p.includes("Reintentar"));
  assert.ok(p.includes("Actualizado hace 1 min"), "conserva la ultima cifra con su antiguedad");
  assert.ok(!p.includes("se actualiza cada 30 s"), "pausado no promete actualizar");
  const h = await renderizar(P, { fase: "pausado", datos: null, edadSeg: 0, reintentar() {} }, { html: true });
  assert.match(h, /<button type="button" class="control">Reintentar<\/button>/, "boton nativo: Enter y espacio lo activan");
  assert.match(h, /role="alert"/);
}

// 9) Accesibilidad: aria-live, tabla equivalente, aria-labels, sin depender del color
{ const h = await verHtml(VIVO_DEMO.sabado);
  assert.match(h, /aria-live="polite"[^>]*>Clase de las/, "region aria-live con las cifras");
  const live = h.match(/<div class="sr-only" aria-live="polite"[^>]*>([^<]*)<\/div>/)[1];
  assert.ok(!live.includes("Actualizado hace"), "el contador de segundos NO va en la region que se anuncia");
  const otraEdad = await verHtml(VIVO_DEMO.sabado, { edadSeg: 29 });
  assert.equal(otraEdad.match(/<div class="sr-only" aria-live="polite"[^>]*>([^<]*)<\/div>/)[1], live, "cambiar los segundos no cambia el anuncio");
  assert.match(h, /<table class="sr-only"><caption>Clases de hoy: cifras en vivo<\/caption>/);
  assert.equal((h.match(/<tr><th scope="row">/g) ?? []).length, 5, "una fila por clase en la tabla equivalente");
  assert.match(h, /aria-labelledby="vivo-t-ejemplo-0800"/);
  assert.match(h, /<span class="vivo-circulo" aria-hidden="true">/, "el circulo decorativo se oculta; el texto lleva la cifra");
  assert.match(h, /tabindex="0"[^>]*>ⓘ</, "la ayuda se alcanza con teclado");
  for (const k of ["Del roster:", "No sabemos quién es:", "Personal:"]) assert.ok(h.includes(k), `etiqueta de texto ${k}`);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.vivo-b-desconocidos \{[^}]*dashed/, "borde punteado = no depende del color");
  assert.match(css, /\.vivo-b-personal \{[^}]*double/, "borde doble");
  assert.match(css, /\.dark \{\s*--v-naranja/, "tema oscuro");
  assert.match(css, /@media \(max-width: 600px\) \{ \.vivo-tarjeta/, "movil");
}

// 10) Sin PII en ningun estado
for (const [k, v] of Object.entries(capturas)) assert.doesNotMatch(v, /@|ejemplo\.test|Estudiante \d/, `PII en ${k}`);

// 11) Dashboard: pestana "En vivo" justo despues de Semana, y nada de En vivo se monta en otras pestanas
{ const d = await readFile(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(d, /PESTANAS = \["Semana", "En vivo", "Presencia", "Cobertura", "Tiempo", "Historial"\]/);
  assert.match(d, /\{pestana === "En vivo" && <EnVivo /,"EnVivo solo se monta con su pestana activa");
  assert.equal((d.match(/useVivo/g) ?? []).length, 1, "Dashboard no llama al hook (solo limpia el cache en cambios de sesion)");
  assert.match(d, /alCambiarSesionVivo\(evento, sesion\?\.user\?\.id\)/);
  const ev = await readFile(new URL("../components/EnVivo.tsx", import.meta.url), "utf8");
  assert.match(ev, /useVivo\(modo, true\)/, "el hook vive dentro del componente que solo existe en su pestana");
  assert.match(ev, /visibilityState === "visible"/);
}

console.log("RESUMEN: vivo_render=ok estados=9 aria_live=ok sin_pii=ok pestana=ok estado=verde");
if (process.argv.includes("--capturas")) for (const [k, v] of Object.entries(capturas)) console.log(`\n[${k}]\n${v}`);
