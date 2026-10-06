export const MODO_DEMO = process.env.MODO_DEMO === '1';
// MODO_DEMO abre las rutas sin login: bloqueado en producción Y en previews de Vercel (VERCEL_ENV 'production' | 'preview').
// Solo se permite en local (VERCEL_ENV ausente) o `vercel dev` ('development').
const entornoVercel = process.env.VERCEL_ENV;
if (MODO_DEMO && entornoVercel && entornoVercel !== 'development')
  throw new Error(`MODO_DEMO está bloqueado en producción y previews de Vercel (VERCEL_ENV=${entornoVercel})`);
export const DEMO_WEEK = '2026-09-14';
