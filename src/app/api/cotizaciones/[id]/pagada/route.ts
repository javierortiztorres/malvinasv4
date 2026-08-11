import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, registros, type VersionCotizacion } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Botón "✅ PAGADO" (pedido de Tomi 11-ago): la acción EXPLÍCITA que marca
// la cotización como pagada y manda a producción las fórmulas retenidas —
// antes eso pasaba solo al subir el comprobante y "quedaba medio raro".
// El comprobante ahora es solo el archivo: se puede subir antes o después.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.estadoPago === 'pagada') {
    return NextResponse.json({ error: 'La cotización ya está marcada como pagada' }, { status: 409 });
  }

  const ahora = new Date();

  // Trazabilidad en el mismo historial de la cotización: quién la marcó
  // pagada y cuándo, con los precios vigentes en ese momento.
  const entrada: VersionCotizacion = {
    fecha: ahora.toISOString(),
    usuario: session.nombre,
    precioTotal: cot.precioTotal,
    precioTransferencia: cot.precioTransferencia,
    motivo: 'Marcada como PAGADA',
  };

  const [cotActualizada] = await db
    .update(cotizaciones)
    .set({
      estadoPago: 'pagada',
      pagadaEn: ahora,
      historial: [...(cot.historial ?? []), entrada],
      updatedAt: ahora,
    })
    .where(eq(cotizaciones.id, id))
    .returning();

  const liberados = await db
    .update(registros)
    .set({ estado: 'pendiente', enProduccion: false, updatedAt: ahora })
    .where(and(eq(registros.cotizacionId, id), eq(registros.estado, 'pendiente_pago')))
    .returning({ id: registros.id });

  return NextResponse.json({ cotizacion: cotActualizada, liberados: liberados.length });
}
