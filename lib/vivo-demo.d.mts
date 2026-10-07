import type { VivoResponse } from "./vivoContrato.d.mts";
export const VIVO_DEMO: Record<"en_curso" | "cobertura_baja" | "sabado" | "proxima" | "terminada" | "sin_clase" | "terminada_sin_cifra", VivoResponse>;
export const VIVO_DEMO_503: { status: 503; body: { disponible: false } };
export const VIVO_DEMO_NO_DISPONIBLE: { status: 200; body: VivoResponse };
