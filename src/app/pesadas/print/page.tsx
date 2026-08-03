import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { fechaHoraAR, formatoLotePI, hoyISO, esPiPendiente } from '@/lib/utils';
import { fmtPct } from '@/lib/engine';
import BotonImprimir from '@/components/BotonImprimir';

export const dynamic = 'force-dynamic';

// Hora argentina para el pie de "impreso el...": hoyISO() ya usa el huso
// horario correcto, acá se le suma la hora en el mismo huso para poder
// reusar fechaHoraAR (que espera "YYYY-MM-DDTHH:mm") sin tocar utils.ts.
function ahoraConHora(): string {
  const hora = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'America/Argentina/Cordoba',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${hoyISO()}T${hora}`;
}

export default async function PlanillaPesadas() {
  // Mismo criterio y misma fuente que la solapa Producto Intermedio
  // (page.tsx): se traen TODOS los PI y se filtra en JS con esPiPendiente,
  // para que nunca puedan divergir un lote de diferencia entre las dos.
  const todos = await db.select().from(registrosPi);
  const registros = todos
    .filter(esPiPendiente)
    .sort((a, b) => (a.loteNumero ?? 0) - (b.loteNumero ?? 0));

  return (
    <div className="doc-impresion mx-auto max-w-[820px] bg-white p-10 text-[13px] leading-relaxed text-black">
      <BotonImprimir />

      <header className="mb-6 text-center">
        <h1 className="text-lg font-bold">Planilla de pesadas — Productos Intermedios pendientes</h1>
        <p className="mt-1 text-xs">
          Impreso: {fechaHoraAR(ahoraConHora())} · {registros.length} lote{registros.length === 1 ? '' : 's'} listado{registros.length === 1 ? '' : 's'}
        </p>
      </header>

      {registros.length === 0 ? (
        <p className="mt-10 text-center text-base font-semibold">No hay productos intermedios pendientes.</p>
      ) : (
        <div className="space-y-6">
          {registros.map((r) => (
            <section key={r.id} className="break-inside-avoid border border-black p-3">
              <div className="mb-2 space-y-0.5">
                <p className="text-base font-black">LOTE: {formatoLotePI(r.poe, r.loteNumero)}</p>
                <p><b>Producto:</b> {r.nombreProducto || '-'}</p>
                <p>
                  <b>Tinta:</b> {r.tintaNombre || '-'}
                  {r.concentracion != null ? ` · ${fmtPct(r.concentracion)}` : ''}
                </p>
                <p><b>POE:</b> {r.poe || '-'}</p>
                <p>
                  <b>Cantidad a producir:</b> {r.cantidadProductoG != null ? `${r.cantidadProductoG} g` : '-'}
                  {r.jeringas ? ` · ${r.jeringas} jeringas de ${r.volumenJeringaMl} ml` : ''}
                </p>
                {r.materiasPrimas.length === 0 && (
                  <p className="text-[11px] italic">(pesadas sin cargar en el sistema)</p>
                )}
              </div>

              <table className="w-full border-collapse border border-black text-center">
                <thead>
                  <tr className="break-inside-avoid">
                    {['Componente', 'Lote a usar', 'Masa teórica (g)', 'Masa real (g)'].map((h) => (
                      <th key={h} className="border border-black p-1 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.materiasPrimas.length === 0 ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="break-inside-avoid">
                        <td className="border border-black p-2">&nbsp;</td>
                        <td className="border border-black p-2">&nbsp;</td>
                        <td className="border border-black p-2">&nbsp;</td>
                        <td className="border border-black p-2">&nbsp;</td>
                      </tr>
                    ))
                  ) : (
                    r.materiasPrimas.map((m, i) => (
                      <tr key={i} className="break-inside-avoid">
                        <td className="border border-black p-1 text-left">{m.nombre}</td>
                        <td className="border border-black p-1">{m.lote}</td>
                        <td className="border border-black p-1">{m.cantidadTeorica ?? ''}</td>
                        <td className="border border-black p-1">&nbsp;</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <p className="mt-2">
                <b>Inicio (fecha y hora):</b>{' '}
                {fechaHoraAR(r.fechaHoraInicio) || (
                  <span className="inline-block w-[48mm] border-b border-black align-bottom">&nbsp;</span>
                )}
              </p>
              <p className="mt-1">
                <b>Fin (fecha y hora):</b>{' '}
                {fechaHoraAR(r.fechaHoraFin) || (
                  <span className="inline-block w-[48mm] border-b border-black align-bottom">&nbsp;</span>
                )}
              </p>
              <p className="mt-1">
                <b>Malaxado:</b> ☐ Tinta · ☐ Polvo · ☐ Ambos ·{' '}
                <b>Tiempo:</b> ______________ min
              </p>
              <p className="mt-1">
                <b>Jeringas obtenidas:</b> ________ ·{' '}
                <b>Volumen:</b> ☐ 10 mL · ☐ 60 mL
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
