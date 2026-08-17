import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, registros } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Botón "Pendiente de pago → a producción": manda los registros retenidos a
// Pendientes AUNQUE no haya llegado el pago (pacientes que pagan después).
// La cotización queda marcada como enviada sin pago y sigue esperando el
// comprobante — cuando llegue, se sube igual que siempre.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const ahora = new Date();
  const liberados = await db
    .update(registros)
    .set({ estado: 'pendiente', enProduccion: false, updatedAt: ahora })
    .where(and(eq(registros.cotizacionId, id), eq(registros.estado, 'pendiente_pago')))
    .returning({ id: registros.id });

  const [cotActualizada] = await db
    .update(cotizaciones)
    .set({ enviadaSinPago: cot.estadoPago !== 'pagada', updatedAt: ahora })
    .where(eq(cotizaciones.id, id))
    .returning();

  return NextResponse.json({ cotizacion: cotActualizada, liberados: liberados.length });
}
