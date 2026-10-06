"use client";
import { useEffect, useState } from "react";
import { useVivo } from "../lib/useVivo";
import { edadSegundos } from "../lib/vivoVista.mjs";
import EnVivoPantalla from "./EnVivoPantalla";

// Pestana "En vivo" (TOC-142). Solo se monta cuando esta pestana esta activa (Dashboard), asi que nada de En vivo se carga
// ni se sondea en las otras pestanas. El contador "Actualizado hace N s" corre con un reloj local de 1 s que se detiene
// cuando la pestana del navegador esta oculta; la lectura a la API es aparte (cada 30 s, ver useVivo).
export default function EnVivo({ modo }: { modo: "demo" | "real" }) {
  const { fase, datos, leidoEn, fallo, reintentar } = useVivo(modo, true);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (id) { clearInterval(id); id = null; } };
    const arrancar = () => { parar(); setAhora(Date.now()); id = setInterval(() => setAhora(Date.now()), 1000); };
    const alVisibilidad = () => (document.visibilityState === "visible" ? arrancar() : parar());
    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alVisibilidad);
    return () => { parar(); document.removeEventListener("visibilitychange", alVisibilidad); };
  }, []);
  const edadSeg = datos && leidoEn ? edadSegundos(datos, leidoEn, ahora) : 0;
  return <EnVivoPantalla fase={fase} datos={datos} edadSeg={edadSeg} fallo={fallo} reintentar={reintentar} />;
}
