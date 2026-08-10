import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cotizaciones, comprobantes, registros, type VersionCotizacion } from '@/db/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { precioTransferenciaSugerido } from '@/lib/cotizador';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Detalle completo de una cotización: la cotización, los metadatos de sus
// comprobantes (NUNCA el archivo — eso va por /api/comprobantes/[id]), los
// registros PT vinculados (para mostrar en qué estado de producción están)
// y las cotizaciones ANTERIORES del mismo paciente — con eso la pantalla
// avisa si se está cobrando más caro o más barato que las últimas veces.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const [archivos, regs, anteriores] = await Promise.all([
    db
      .select({
        id: comprobantes.id,
        nombreArchivo: comprobantes.nombreArchivo,
        mime: comprobantes.mime,
        tamanoBytes: comprobantes.tamanoBytes,
        subidoPor: comprobantes.subidoPor,
        createdAt: comprobantes.createdAt,
      })
      .from(comprobantes)
      .where(eq(comprobantes.cotizacionId, id))
      .orderBy(desc(comprobantes.createdAt)),
    db.select().from(registros).where(eq(registros.cotizacionId, id)),
    cot.dni
      ? db
          .select()
          .from(cotizaciones)
          .where(and(eq(cotizaciones.dni, cot.dni), ne(cotizaciones.id, id)))
          .orderBy(desc(cotizaciones.createdAt))
          .limit(8)
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ cotizacion: cot, comprobantes: archivos, registros: regs, anteriores });
}

// Edición de la cotización — editable HASTA el pago (después solo Admin).
// Si cambia el precio, el server agrega SIEMPRE una entrada al historial
// (además del warning que muestra la pantalla): quién, cuándo, qué precio
// y el motivo si lo escribió.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  if (cot.estadoPago === 'pagada' && session.rol !== 'admin') {
    return NextResponse.json(
      { error: 'La cotización ya está paga: solo el Admin puede modificarla' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.linkPago === 'string') patch.linkPago = body.linkPago.trim();
  if (typeof body.notas === 'string') patch.notas = body.notas;

  const traePrecio = body.precioTotal !== undefined;
  const nuevoPrecio =
    body.precioTotal === null || body.precioTotal === '' ? null : Number(body.precioTotal);
  if (traePrecio && nuevoPrecio !== null && !Number.isFinite(nuevoPrecio)) {
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
  }

  const traeTransf = body.precioTransferencia !== undefined;
  const nuevaTransf =
    body.precioTransferencia === null || body.precioTransferencia === ''
      ? null
      : Number(body.precioTransferencia);
  if (traeTransf && nuevaTransf !== null && !Number.isFinite(nuevaTransf)) {
    return NextResponse.json({ error: 'Precio de transferencia inválido' }, { status: 400 });
  }

  const cambioPrecio = traePrecio && nuevoPrecio !== cot.precioTotal;
  if (traePrecio) patch.precioTotal = nuevoPrecio;
  if (traeTransf) {
    patch.precioTransferencia = nuevaTransf;
  } else if (cambioPrecio) {
    // Si cambió el total y no mandaron transferencia explícita, se sugiere
    // sola con el descuento vigente (editable después).
    patch.precioTransferencia = precioTransferenciaSugerido(nuevoPrecio);
  }

  if (cambioPrecio) {
    const entrada: VersionCotizacion = {
      fecha: new Date().toISOString(),
      usuario: session.nombre,
      precioTotal: nuevoPrecio,
      precioTransferencia: (patch.precioTransferencia as number | null) ?? cot.precioTransferencia,
      motivo: typeof body.motivo === 'string' ? body.motivo.trim() : '',
    };
    patch.historial = [...(cot.historial ?? []), entrada];
  }

  const [row] = await db.update(cotizaciones).set(patch).where(eq(cotizaciones.id, id)).returning();
  return NextResponse.json(row);
}

// Cancelar una cotización: borra la cotización y sus comprobantes; los
// registros que TODAVÍA estaban retenidos en Pendiente de pago se borran
// (nunca llegaron a producción); los que ya avanzaron solo se desvinculan.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.estadoPago === 'pagada' && session.rol !== 'admin') {
    return NextResponse.json(
      { error: 'La cotización ya está paga: solo el Admin puede cancelarla' },
      { status: 403 }
    );
  }

  await db
    .delete(registros)
    .where(and(eq(registros.cotizacionId, id), eq(registros.estado, 'pendiente_pago')));
  await db
    .update(registros)
    .set({ cotizacionId: null, updatedAt: new Date() })
    .where(eq(registros.cotizacionId, id));
  await db.delete(comprobantes).where(eq(comprobantes.cotizacionId, id));
  await db.delete(cotizaciones).where(eq(cotizaciones.id, id));
  return NextResponse.json({ ok: true });
}
