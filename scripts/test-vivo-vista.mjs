import assert from "node:assert/strict";
import { VIVO_DEMO, VIVO_DEMO_503 } from "../lib/vivo-demo.mjs";
import { ordenarClases, porcentajeRoster, horaCorta, tituloClase, edadSegundos, textoEdad, resumenAnuncio, esperaTrasError,
  proximaClase, hayEnCurso, esVivoValido, MAX_ERRORES, INTERVALO_MS, textoRoster, cifraNoDisponible, AVISO_CIFRA_NO_DISPONIBLE, AYUDA_DESCONOCIDOS } from "../lib/vivoVista.mjs";

// Los datos de ejemplo respetan EXACTAMENTE el contrato de /api/vivo (mismas claves, mismos tipos).
const CLAVES_RESP = ["actualizado_en", "aviso_general", "clases", "disponible", "hora_servidor", "semana"];
const CLAVES_CLASE = ["aviso", "cobertura_baja", "cuenta_zoom", "desconocidos_ahora_aprox", "desconocidos_maximo", "estado", "etiqueta", "eventos",
  "fin", "inicio", "otra_franja_ahora_aprox", "otra_franja_maximo", "personal_ahora_aprox", "personal_maximo", "roster_ahora_aprox", "roster_maximo", "roster_total", "sala_activa", "slot_id", "ultima_actividad"];
const ENTEROS = ["desconocidos_ahora_aprox", "desconocidos_maximo", "eventos", "otra_franja_ahora_aprox", "otra_franja_maximo", "personal_ahora_aprox", "personal_maximo", "roster_ahora_aprox", "roster_maximo", "roster_total"];
for (const [nombre, r] of Object.entries(VIVO_DEMO)) {
  assert.deepEqual(Object.keys(r).sort(), CLAVES_RESP, nombre);
  assert.equal(r.disponible, true);
  for (const c of r.clases) {
    assert.deepEqual(Object.keys(c).sort(), CLAVES_CLASE, `${nombre}/${c.slot_id}`);
    for (const k of ENTEROS) assert.ok(Number.isInteger(c[k]) && c[k] >= 0, `${k}`);
    assert.ok(["abierta", "proxima", "terminada", "sin_sala"].includes(c.estado));
    assert.ok(c.roster_maximo <= c.roster_total, "el maximo no pasa del roster");
    assert.ok(!Number.isNaN(Date.parse(c.inicio)) && !Number.isNaN(Date.parse(c.fin)));
  }
}
assert.equal(VIVO_DEMO_503.status, 503);
assert.deepEqual(VIVO_DEMO_503.body, { disponible: false });

// Sin PII: ni correos ni dominios de ejemplo en ningun fixture.
const todo = JSON.stringify([VIVO_DEMO, VIVO_DEMO_503]);
assert.doesNotMatch(todo, /@|ejemplo\.test|Estudiante \d/, "los fixtures solo llevan conteos");

// Sabado: 3 clases a la vez + 1 proxima + 1 terminada; en curso primero, terminada al final.
const sab = ordenarClases(VIVO_DEMO.sabado.clases);
assert.deepEqual(sab.map((c) => c.estado), ["abierta", "abierta", "abierta", "proxima", "terminada"]);
assert.equal(hayEnCurso(VIVO_DEMO.sabado.clases), true);
assert.equal(horaCorta("2026-10-10T18:00:00-05:00"), "18:00");
assert.equal(horaCorta("2026-10-10T23:00:00Z"), "18:00", "siempre hora de Colombia");
assert.equal(tituloClase(VIVO_DEMO.en_curso.clases[0]), "Clase de las 18:00 · comunicaciones");
assert.equal(proximaClase(VIVO_DEMO.proxima.clases).slot_id, "ejemplo-1800");
assert.equal(proximaClase(VIVO_DEMO.en_curso.clases), null);

// Barra: el numero firme es el maximo; nunca pasa de 0-100.
assert.equal(porcentajeRoster({ roster_maximo: 31, roster_total: 40 }), 78);
assert.equal(porcentajeRoster({ roster_maximo: 5, roster_total: 0 }), 0);
assert.equal(porcentajeRoster({ roster_maximo: 50, roster_total: 40 }), 100);

// "Actualizado hace N s": cuenta desde la lectura y suma el desfase servidor-actualizacion.
const d = { ...VIVO_DEMO.en_curso, actualizado_en: "2026-10-10T18:19:50-05:00", hora_servidor: "2026-10-10T18:20:00-05:00" };
assert.equal(edadSegundos(d, 1000, 1000), 10, "10 s ya al llegar");
assert.equal(edadSegundos(d, 1000, 8000), 17);
assert.equal(edadSegundos(VIVO_DEMO.en_curso, 5000, 1000), 0, "nunca negativo");
assert.equal(textoEdad(0), "Actualizado hace 0 s");
assert.equal(textoEdad(59), "Actualizado hace 59 s");
assert.equal(textoEdad(125), "Actualizado hace 2 min");

// El anuncio para lectores de pantalla solo cambia si cambia una cifra (no por el reloj).
const a1 = resumenAnuncio(VIVO_DEMO.en_curso);
const otra = { ...VIVO_DEMO.en_curso, actualizado_en: "2026-10-10T18:20:30-05:00", hora_servidor: "2026-10-10T18:20:30-05:00" };
assert.equal(resumenAnuncio(otra), a1, "mismo conteo = mismo anuncio aunque pasen 30 s");
const mas = { ...otra, clases: [{ ...otra.clases[0], roster_ahora_aprox: 28 }] };
assert.notEqual(resumenAnuncio(mas), a1);
assert.equal(resumenAnuncio(null), "");

assert.equal(esVivoValido(VIVO_DEMO.sabado), true);
assert.equal(esVivoValido({ clases: "x" }), false);
assert.equal(esVivoValido(null), false);
assert.equal(MAX_ERRORES, 3);
assert.equal(INTERVALO_MS, 45000, "sondeo del cliente 45 s (cache de servidor 30 s)");
assert.deepEqual([1, 2, 3, 20].map(esperaTrasError), [5000, 10000, 20000, 60000]);

// (1) «X de Y»: nunca X>Y; texto neutro y barra acotada
assert.deepEqual(textoRoster({ roster_maximo: 31, roster_total: 40 }), { excede: false, texto: "31 de 40", valorBarra: 31, totalBarra: 40 });
{ const t = textoRoster({ roster_maximo: 46, roster_total: 40 });
  assert.equal(t.excede, true); assert.equal(t.texto, "46 (supera el roster esperado)"); assert.ok(t.valorBarra <= t.totalBarra); assert.ok(!/de 40/.test(t.texto)); }
assert.equal(textoRoster({ roster_maximo: 3, roster_total: 0 }).texto, "3 (supera el roster esperado)");
assert.match(resumenAnuncio({ ...VIVO_DEMO.en_curso, clases: [{ ...VIVO_DEMO.en_curso.clases[0], roster_maximo: 45 }] }), /en su horario 45 \(supera el roster esperado\)/);
assert.match(resumenAnuncio(VIVO_DEMO.en_curso), /colados \(otra clase\) 2/, "el anuncio incluye la otra franja solo si > 0");
assert.doesNotMatch(resumenAnuncio(VIVO_DEMO.cobertura_baja), /otra franja/);
// (2) cifra no disponible
assert.equal(cifraNoDisponible(VIVO_DEMO.terminada_sin_cifra.clases[0]), true);
assert.equal(cifraNoDisponible(VIVO_DEMO.terminada.clases[0]), false);
assert.equal(cifraNoDisponible({ ...VIVO_DEMO.en_curso.clases[0], aviso: AVISO_CIFRA_NO_DISPONIBLE }), false, "solo aplica a terminadas");
assert.match(resumenAnuncio(VIVO_DEMO.terminada_sin_cifra), /Cifra final no disponible aquí; ver pestaña Presencia/);
// (5) reloj: edad = hora_servidor - actualizado_en + tiempo en el cliente (el servidor sirvio un cache de 40 s)
{ const c = { ...VIVO_DEMO.en_curso, actualizado_en: "2026-10-10T18:19:20-05:00", hora_servidor: "2026-10-10T18:20:00-05:00" };
  assert.equal(edadSegundos(c, 100_000, 100_000), 40, "al llegar ya tiene 40 s de edad");
  assert.equal(edadSegundos(c, 100_000, 107_000), 47, "mas 7 s en el cliente"); }
// (7) la ayuda de desconocidos avisa del limite de nombres iguales
assert.match(AYUDA_DESCONOCIDOS, /mismo nombre|se llaman igual/); assert.match(AYUDA_DESCONOCIDOS, /se cuentan como una/);
console.log("RESUMEN: vivo_vista=ok fixtures_contrato=ok sin_pii=ok estado=verde");
