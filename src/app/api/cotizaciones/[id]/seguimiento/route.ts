import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Edición de los datos de seguimiento de un pedido (v2.2.0).
// - celular / direccionEnvio: Admin y Atención (Atención los carga desde
//   el detalle de la cotización; Admin desde la solapa 📒 Seguimiento).
// - medioPago / montoCobrado / envioMonto: SOLO Admin (datos de cobro).
// PATCH con whitelist explícita — el PUT general de cotizaciones no toca
// estos campos, y este endpoint no toca los de la cotización.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.celular === 'string') patch.celular = body.celular.trim().slice(0, 60);
  if (typeof body.direccionEnvio === 'string') patch.direccionEnvio = body.direccionEnvio.trim().slice(0, 300);

  const soloAdmin = ['medioPago', 'montoCobrado', 'envioMonto'] as const;
  const traeDeCobro = soloAdmin.some((k) => body[k] !== undefined);
  if (traeDeCobro && session.rol !== 'admin') {
    return NextResponse.json({ error: 'Los datos de cobro los edita solo el Admin' }, { status: 403 });
  }
  if (typeof body.medioPago === 'string') patch.medioPago = body.medioPago.trim().slice(0, 200);
  for (const campo of ['montoCobrado', 'envioMonto'] as const) {
    if (body[campo] !== undefined) {
      const v = body[campo] === null || body[campo] === '' ? null : Number(body[campo]);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json({ error: `${campo} inválido` }, { status: 400 });
      }
      patch[campo] = v;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }
  patch.updatedAt = new Date();

  const [row] = await db.update(cotizaciones).set(patch).where(eq(cotizaciones.id, id)).returning();
  return NextResponse.json(row);
}
