import Dashboard from "../components/Dashboard";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="main">
          <div className="empty">Cargando panel…</div>
        </main>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
