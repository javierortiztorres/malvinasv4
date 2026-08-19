import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { cotizaciones } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Contacto del paciente desde el CHECKOUT PROPIO (v2.2.0): celular y
// dirección de envío que el paciente escribe al pagar. Llega apenas los
// completa (antes de pagar), porque si paga por transferencia al alias no
// hay ningún webhook después — pagada-externa solo corre para Mercado
// Pago. Autenticado con el secreto compartido (header x-checkout-secret),
// igual que pagada-externa: lo llama el server de pillar-checkout, nunca
// el navegador. Solo escribe si el paciente puso algo (no pisa con vacío
// lo que Atención ya haya cargado).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const secreto = process.env.CHECKOUT_SECRET ?? '';
  const recibido = req.headers.get('x-checkout-secret') ?? '';
  const a = Buffer.from(secreto);
  const b = Buffer.from(recibido);
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const celular = typeof body?.celular === 'string' ? body.celular.trim().slice(0, 60) : '';
  const direccion = typeof body?.direccion === 'string' ? body.direccion.trim().slice(0, 300) : '';
  if (!celular && !direccion) {
    return NextResponse.json({ error: 'Nada para guardar' }, { status: 400 });
  }

  await db
    .update(cotizaciones)
    .set({
      ...(celular ? { celular } : {}),
      ...(direccion ? { direccionEnvio: direccion } : {}),
      updatedAt: new Date(),
    })
    .where(eq(cotizaciones.id, id));

  return NextResponse.json({ ok: true });
}
