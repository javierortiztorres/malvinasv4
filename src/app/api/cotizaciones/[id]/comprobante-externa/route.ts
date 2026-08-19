import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { comprobantes, cotizaciones, type VersionCotizacion } from '@/db/schema';
import { eq } from 'drizzle-orm';

const MIMES_VALIDOS = new Set(['image/jpeg', 'image/png', 'application/pdf']);
// Mismo límite que la subida interna: body de Vercel 4.5 MB, base64 +33%.
const MAX_BASE64_CHARS = 4_800_000; // ~3.5 MB de archivo real

// Comprobante de transferencia subido POR EL PACIENTE desde el checkout
// (v2.2.1 — pedido de Tomi 18-ago). Guarda el archivo y deja rastro en el
// historial; NO marca pagada ni manda nada a producción: la plata la
// verifica Atención en el banco y confirma con el botón ✅ PAGADO (decisión
// de Tomi: "Atención verifica y confirma"). Autenticado con el secreto
// compartido (header x-checkout-secret) — lo llama el server de
// pillar-checkout, nunca el navegador.
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
  if (cot.estadoPago === 'pagada') {
    return NextResponse.json({ error: 'Este pedido ya está pago' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const nombreArchivo = typeof body.nombreArchivo === 'string' ? body.nombreArchivo.slice(0, 200) : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const datosBase64 = typeof body.datosBase64 === 'string' ? body.datosBase64 : '';

  if (!MIMES_VALIDOS.has(mime)) {
    return NextResponse.json({ error: 'El comprobante tiene que ser .jpg, .png o .pdf' }, { status: 400 });
  }
  if (!datosBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (datosBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: 'El archivo es muy pesado (máx. ~3.5 MB). Probá con una foto más liviana.' },
      { status: 413 }
    );
  }

  const ahora = new Date();
  const tamanoBytes = Math.floor(datosBase64.length * 0.75);
  const [archivo] = await db
    .insert(comprobantes)
    .values({
      cotizacionId: id,
      nombreArchivo,
      mime,
      tamanoBytes,
      datosBase64,
      subidoPor: 'Paciente (checkout)',
    })
    .returning({ id: comprobantes.id });

  // Rastro en el historial para que Atención lo vea también en el detalle.
  const entrada: VersionCotizacion = {
    fecha: ahora.toISOString(),
    usuario: 'Paciente (checkout)',
    precioTotal: cot.precioTotal,
    precioTransferencia: cot.precioTransferencia,
    motivo: '📎 Comprobante de transferencia subido desde el checkout — verificar y confirmar con ✅ PAGADO',
  };

  await db
    .update(cotizaciones)
    .set({ historial: [...(cot.historial ?? []), entrada], updatedAt: ahora })
    .where(eq(cotizaciones.id, id));

  return NextResponse.json({ ok: true, comprobanteId: archivo.id });
}
