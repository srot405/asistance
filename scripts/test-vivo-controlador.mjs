import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { crearControlador } from "../lib/vivoControlador.mjs";
import { VIVO_DEMO } from "../lib/vivo-demo.mjs";

// Reloj y red falsos: nada toca la red ni espera de verdad.
function entorno({ respuestas, visible = true }) {
  let t = 1_000_000, id = 0, vis = visible; const timers = new Map(); const llamadas = []; const estados = []; let i = 0;
  const cfg = {
    ahora: () => t, visible: () => vis,
    poner: (f, ms) => { const k = ++id; timers.set(k, { f, en: t + ms }); return k; },
    quitar: (k) => { timers.delete(k); },
    pedir: async (signal) => { llamadas.push({ t, signal }); const r = respuestas[Math.min(i++, respuestas.length - 1)];
      if (r instanceof Error) throw r; return r; },
    alCambiar: (e) => estados.push(e),
  };
  const asentar = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
  const avanzar = async (ms) => { const fin = t + ms;
    for (;;) { const prox = [...timers.entries()].filter(([, x]) => x.en <= fin).sort((a, b) => a[1].en - b[1].en)[0];
      if (!prox) break; t = Math.max(t, prox[1].en); timers.delete(prox[0]); prox[1].f(); await asentar(); }
    t = fin; await asentar(); };
  return { cfg, llamadas, estados, timers, avanzar, asentar, ocultar: () => { vis = false; }, mostrar: () => { vis = true; }, hora: () => t };
}
const ok = { status: 200, body: VIVO_DEMO.en_curso };
const falla = { status: 500, body: null };

// 1) Lee al iniciar y luego cada 45 s, no antes.
{ const e = entorno({ respuestas: [ok] }); const c = crearControlador(e.cfg);
  c.iniciar(); await e.asentar();
  assert.equal(e.llamadas.length, 1, "lee al abrir la pestana");
  assert.equal(c.estado().fase, "ok");
  await e.avanzar(44_000); assert.equal(e.llamadas.length, 1, "a los 44 s todavia no");
  await e.avanzar(1_000); assert.equal(e.llamadas.length, 2, "a los 45 s lee");
  await e.avanzar(90_000); assert.equal(e.llamadas.length, 4);
  c.detener(); await e.avanzar(120_000); assert.equal(e.llamadas.length, 4, "al salir de la pestana no sondea mas");
  assert.equal(e.timers.size, 0, "sin temporizadores colgados");
}

// 2) Con la pestana del navegador oculta NO hace fetch; al volver, lee de una vez si lo ultimo es viejo.
{ const e = entorno({ respuestas: [ok], visible: false }); const c = crearControlador(e.cfg);
  c.iniciar(); await e.avanzar(120_000);
  assert.equal(e.llamadas.length, 0, "oculta desde el inicio: cero peticiones");
  e.mostrar(); c.visibilidad(); await e.asentar();
  assert.equal(e.llamadas.length, 1, "al volver visible lee");
  await e.avanzar(10_000); e.ocultar(); c.visibilidad();
  const antes = e.llamadas.length; await e.avanzar(300_000);
  assert.equal(e.llamadas.length, antes, "oculta: sin sondeo en segundo plano");
  e.mostrar(); c.visibilidad(); await e.asentar();
  assert.equal(e.llamadas.length, antes + 1, "dato viejo (>45 s): lee al volver");
  c.visibilidad(); await e.asentar(); // visible otra vez sin cambio
  assert.equal(e.llamadas.length, antes + 1, "dato fresco: no repite");
  c.detener();
}

// 3) Oculta durante una peticion en vuelo: se aborta y su respuesta no pisa el estado.
{ let soltar; const e = entorno({ respuestas: [ok] });
  e.cfg.pedir = (signal) => { e.llamadas.push({ signal }); return new Promise((r) => { soltar = () => r(ok); }); };
  const c = crearControlador(e.cfg); c.iniciar(); await e.asentar();
  e.ocultar(); c.visibilidad(); assert.equal(e.llamadas[0].signal.aborted, true, "AbortController cancela");
  soltar(); await e.asentar(); assert.equal(c.estado().fase, "cargando", "respuesta tardia ignorada");
  c.detener();
}

// 4) Backoff y pausa tras 3 errores seguidos; Reintentar reanuda.
{ const e = entorno({ respuestas: [falla, falla, falla, ok] }); const c = crearControlador(e.cfg);
  c.iniciar(); await e.asentar();
  assert.equal(c.estado().errores, 1); assert.equal(c.estado().fase, "error");
  await e.avanzar(4_999); assert.equal(e.llamadas.length, 1, "backoff 1: espera 5 s");
  await e.avanzar(1); assert.equal(e.llamadas.length, 2);
  assert.equal(c.estado().errores, 2);
  await e.avanzar(9_999); assert.equal(e.llamadas.length, 2, "backoff 2: espera 10 s");
  await e.avanzar(1); assert.equal(e.llamadas.length, 3);
  assert.equal(c.estado().fase, "pausado", "3 errores seguidos = pausa");
  assert.equal(e.timers.size, 0, "pausado: sin reintentos automaticos");
  await e.avanzar(600_000); assert.equal(e.llamadas.length, 3, "pausado no sondea");
  e.ocultar(); c.visibilidad(); e.mostrar(); c.visibilidad(); await e.asentar();
  assert.equal(e.llamadas.length, 3, "volver a la pestana no reanuda una pausa");
  c.reintentar(); await e.asentar();
  assert.equal(e.llamadas.length, 4, "Reintentar lee ya");
  assert.equal(c.estado().fase, "ok"); assert.equal(c.estado().errores, 0);
  c.detener();
}

// 5) Un exito intermedio reinicia la cuenta; con datos previos el error no borra la pantalla.
{ const e = entorno({ respuestas: [falla, ok, falla, falla, ok] }); const c = crearControlador(e.cfg);
  c.iniciar(); await e.asentar(); await e.avanzar(5_000);
  assert.equal(c.estado().errores, 0, "exito reinicia");
  await e.avanzar(45_000); assert.equal(c.estado().errores, 1);
  assert.equal(c.estado().fase, "ok", "con datos previos sigue mostrando la ultima cifra");
  assert.ok(c.estado().datos, "datos conservados"); assert.equal(c.estado().fallo, true);
  c.detener();
}

// 6) 503 y {disponible:false} son un estado, no un error: no cuentan para la pausa y se vuelve a intentar a los 45 s.
{ const e = entorno({ respuestas: [{ status: 503, body: { disponible: false } }, { status: 200, body: { ...VIVO_DEMO.en_curso, disponible: false } },
    { status: 503, body: null }, { status: 503, body: null }, ok] });
  const c = crearControlador(e.cfg); c.iniciar(); await e.asentar();
  assert.equal(c.estado().fase, "no_disponible"); assert.equal(c.estado().errores, 0); assert.equal(c.estado().datos, null);
  await e.avanzar(45_000); await e.avanzar(45_000); await e.avanzar(45_000);
  assert.notEqual(c.estado().fase, "pausado");
  await e.avanzar(45_000); assert.equal(c.estado().fase, "ok", "se recupera solo");
  c.detener();
}

// 7) Un dato valido en cache (fresco) no dispara otra lectura al reabrir; uno viejo si.
{ const e = entorno({ respuestas: [ok] });
  const c = crearControlador({ ...e.cfg, estadoInicial: { fase: "ok", datos: VIVO_DEMO.en_curso, leidoEn: e.hora() - 5_000 } });
  c.iniciar(); await e.asentar(); assert.equal(e.llamadas.length, 0, "cache fresco: sin peticion");
  await e.avanzar(40_000); assert.equal(e.llamadas.length, 1, "lee cuando se cumplen 45 s");
  c.detener();
  const e2 = entorno({ respuestas: [ok] });
  const c2 = crearControlador({ ...e2.cfg, estadoInicial: { fase: "ok", datos: VIVO_DEMO.en_curso, leidoEn: e2.hora() - 90_000 } });
  c2.iniciar(); await e2.asentar(); assert.equal(e2.llamadas.length, 1, "cache viejo: lee ya"); c2.detener();
}

// 8) Cache del hook: se vacia al cerrar sesion y al entrar otro usuario; TOKEN_REFRESHED del mismo no lo vacia.
{ const src = await readFile(new URL("../lib/useVivo.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ex = {};
  vm.runInNewContext(js, { exports: ex, console, require: (n) => n === "react" ? { useCallback() {}, useEffect() {}, useState() {}, useRef() {} } : {} });
  ex.guardarCacheVivo({ datos: VIVO_DEMO.en_curso }); assert.equal(ex.tamanoCacheVivo(), 1);
  ex.alCambiarSesionVivo("SIGNED_IN", "u1"); ex.alCambiarSesionVivo("TOKEN_REFRESHED", "u1");
  assert.equal(ex.tamanoCacheVivo(), 1, "mismo usuario conserva");
  ex.alCambiarSesionVivo("SIGNED_IN", "u2"); assert.equal(ex.tamanoCacheVivo(), 0, "otro usuario: vacio");
  ex.guardarCacheVivo({ datos: 1 }); ex.alCambiarSesionVivo("SIGNED_OUT", null); assert.equal(ex.tamanoCacheVivo(), 0, "cerrar sesion: vacio");
  // El hook usa el token de sesion como useTiempo y solo llama a /api/vivo.
  assert.match(src, /Authorization: `Bearer \$\{sesion\.access_token\}`/);
  assert.match(src, /cache: "no-store"/); assert.match(src, /signal/);
  assert.match(src, /visibilitychange/);
  assert.equal((src.match(/fetch\(/g) ?? []).length, 1, "un solo fetch, a /api/vivo");
  assert.match(src, /fetch\("\/api\/vivo"/);
}
// 9) disponible:false con motivo: el controlador lo conserva (sin detalles tecnicos); un 503 no trae motivo; al recuperarse se limpia.
{ const motivo = "La semana actual todavía no está congelada: no hay clases para mostrar.";
  const e = entorno({ respuestas: [{ status: 200, body: { disponible: false, clases: [], aviso_general: motivo } }, { status: 503, body: null }, ok] });
  const c = crearControlador(e.cfg); c.iniciar(); await e.asentar();
  assert.equal(c.estado().fase, "no_disponible"); assert.equal(c.estado().aviso, motivo);
  await e.avanzar(45_000); assert.equal(c.estado().fase, "no_disponible"); assert.equal(c.estado().aviso, null, "503: sin motivo");
  await e.avanzar(45_000); assert.equal(c.estado().fase, "ok"); assert.equal(c.estado().aviso, null);
  c.detener();
}
console.log("RESUMEN: vivo_controlador=ok backoff=ok pausa_3_errores=ok visibilidad=ok reintentar=ok cache_sesion=ok estado=verde");
