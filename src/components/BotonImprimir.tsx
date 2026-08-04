'use client';

export default function BotonImprimir() {
  return (
    <div className="no-print mb-6 flex justify-end gap-2">
      <button
        className="rounded-md bg-tussok px-4 py-2 text-sm font-semibold text-profundo"
        onClick={() => window.print()}
      >
        🖨️ Imprimir / Guardar como PDF
      </button>
    </div>
  );
}
