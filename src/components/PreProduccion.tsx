'use client';

// Pre-producción (B-30b): solapa nueva, visible para Admin e Impresión.
// El ruteo real Pendientes↔Pre-producción↔En producción es de B-31 — por
// ahora ningún registro puede caer acá, así que siempre queda vacía.
export default function PreProduccion() {
  return (
    <div className="card p-10 text-center text-slate-500">
      Sin recetas en pre-producción todavía.
    </div>
  );
}
