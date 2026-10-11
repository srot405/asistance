"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sesionActual } from "./auth";
import { aplicarRolDemo } from "./rolUi";
import type { ListaVivoResponse } from "./vivoNominal.d.mts";

// «Lista en vivo» (TOC-153): lee /api/vivo-nominal cada 45 s SOLO con la pestana abierta y el navegador visible. Sin cache entre
// sesiones (es PII): al desmontar la pestana el dato se descarta. "Actualizar" pide ya, con una espera minima de 8 s entre clics.
const INTERVALO_MS = 45_000;
const ESPERA_ACTUALIZAR_MS = 8_000;
export type FaseLista = "cargando" | "ok" | "no_disponible" | "sin_permiso" | "error";
type Respuesta = ListaVivoResponse & { alcance?: { ciudad: string | null } };

export function urlListaVivo(modo: "demo" | "real", formato?: "csv"): URL {
  const url = new URL("/api/vivo-nominal", window.location.origin);
  if (formato) url.searchParams.set("formato", formato);
  if (modo === "demo") { url.searchParams.set("demo", "1"); aplicarRolDemo(url.searchParams); }
  return url;
}

export function useListaVivo(modo: "demo" | "real") {
  const [fase, setFase] = useState<FaseLista>("cargando");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [leidoEn, setLeidoEn] = useState(0);
  const ultimoPedido = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCurso = useRef<AbortController | null>(null);

  const leer = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (document.visibilityState !== "visible") return;
    enCurso.current?.abort();
    const abort = new AbortController(); enCurso.current = abort;
    ultimoPedido.current = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (modo === "real") {
        const sesion = await sesionActual();
        if (!sesion?.access_token) { setFase("error"); setMensaje("Tu sesión expiró. Vuelve a iniciar sesión."); return; }
        headers.Authorization = `Bearer ${sesion.access_token}`;
      }
      const r = await fetch(urlListaVivo(modo), { headers, cache: "no-store", signal: abort.signal });
      const body = await r.json().catch(() => null) as (Respuesta & { error?: string }) | null;
      if (r.status === 403) { setFase("sin_permiso"); setMensaje(body?.error ?? "Sin permiso."); setDatos(null); return; }
      if (!r.ok || !body) throw new Error(`HTTP ${r.status}`);
      if (!body.disponible) { setFase("no_disponible"); setMensaje(body.aviso_general ?? "No hay datos para mostrar."); setDatos(null); }
      else { setDatos(body); setFase("ok"); setMensaje(""); }
      setLeidoEn(Date.now());
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setFase((f) => (f === "ok" ? "ok" : "error"));
      setMensaje("No se pudo actualizar la lista. Se reintenta sola en unos segundos.");
    } finally {
      if (enCurso.current === abort) enCurso.current = null;
      if (document.visibilityState === "visible") timer.current = setTimeout(leer, INTERVALO_MS);
    }
  }, [modo]);

  useEffect(() => {
    const alVisibilidad = () => {
      if (document.visibilityState !== "visible") { if (timer.current) clearTimeout(timer.current); timer.current = null; enCurso.current?.abort(); return; }
      if (Date.now() - ultimoPedido.current >= INTERVALO_MS) leer();
      else timer.current = setTimeout(leer, INTERVALO_MS - (Date.now() - ultimoPedido.current));
    };
    document.addEventListener("visibilitychange", alVisibilidad);
    leer();
    return () => { document.removeEventListener("visibilitychange", alVisibilidad); if (timer.current) clearTimeout(timer.current); enCurso.current?.abort(); };
  }, [leer]);

  const actualizar = useCallback(() => { if (Date.now() - ultimoPedido.current >= ESPERA_ACTUALIZAR_MS) leer(); }, [leer]);
  return { fase, datos, mensaje, leidoEn, actualizar, esperaActualizarMs: ESPERA_ACTUALIZAR_MS };
}
