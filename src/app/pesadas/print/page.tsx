import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { fechaHoraAR, formatoLotePI, hoyISO } from '@/lib/utils';
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
  const registros = await db
    .select()
    .from(registrosPi)
    .where(eq(registrosPi.estado, 'en_proceso'))
    .orderBy(asc(registrosPi.loteNumero));

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
                    <tr className="break-inside-avoid">
                      <td className="border border-black p-2" colSpan={4}>Sin pesadas cargadas todavía.</td>
                    </tr>
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
                <b>Inicio:</b> {fechaHoraAR(r.fechaHoraInicio) || '______'} ·{' '}
                <b>Fin:</b> {fechaHoraAR(r.fechaHoraFin) || '______'}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
