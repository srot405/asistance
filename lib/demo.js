export const MODO_DEMO = process.env.MODO_DEMO === '1';
if (MODO_DEMO && process.env.VERCEL_ENV === 'production') throw new Error('MODO_DEMO está bloqueado en producción');
export const DEMO_WEEK = '2026-09-14';
