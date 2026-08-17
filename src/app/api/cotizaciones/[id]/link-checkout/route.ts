import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { firmaCorta } from '@/lib/checkoutFirma';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Genera el LINK CORTO del checkout propio y lo deja en linkPago:
//   {CHECKOUT_URL}/c/{id}/{firma}
// (pedido de Tomi 14-ago: el link viejo con el payload adentro era
// "SUPER largo"). La firma es HMAC del nº de cotización con el secreto
// compartido; el checkout busca los datos VIGENTES en /checkout-data —
// si el precio se edita después de mandar el link, el paciente ve lo
// actual, y si ya está paga el checkout no deja pagar de nuevo.
//
// ⚠️ La cotización del checkout se calcula con "Sin envío": el paciente
// elige el envío en el link y se suma allá.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const secreto = process.env.CHECKOUT_SECRET;
  const urlBase = (process.env.CHECKOUT_URL ?? '').replace(/\/$/, '');
  if (!secreto || !urlBase) {
    return NextResponse.json(
      { error: 'Faltan CHECKOUT_SECRET y/o CHECKOUT_URL en las variables de entorno de Vercel' },
      { status: 500 }
    );
  }

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.precioTotal == null || cot.precioTransferencia == null) {
    return NextResponse.json(
      { error: 'La cotización necesita precio total y transferencia antes de generar el link' },
      { status: 400 }
    );
  }

  const link = `${urlBase}/c/${id}/${firmaCorta(id, secreto)}`;

  const [row] = await db
    .update(cotizaciones)
    .set({ linkPago: link, updatedAt: new Date() })
    .where(eq(cotizaciones.id, id))
    .returning();

  return NextResponse.json({ cotizacion: row, link });
}
