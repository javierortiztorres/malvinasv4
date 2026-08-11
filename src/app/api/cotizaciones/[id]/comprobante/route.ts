import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { comprobantes, cotizaciones } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

const MIMES_VALIDOS = new Set(['image/jpeg', 'image/png', 'application/pdf']);
// El límite de body de las funciones de Vercel es 4.5 MB: con base64
// (+33%) esto deja margen. Las imágenes ya vienen comprimidas del cliente.
const MAX_BASE64_CHARS = 4_800_000; // ~3.5 MB de archivo real

// Subir el comprobante de pago de una cotización. Desde el 11-ago
// (pedido de Tomi: "se manda solo y queda medio raro") esto SOLO guarda
// el archivo — marcar PAGADA y mandar a producción es la acción explícita
// del botón ✅ (endpoint /pagada). El comprobante se puede subir antes o
// después de marcar el pago.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });

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
      { error: 'El archivo es muy pesado (máx. ~3.5 MB). Si es PDF, exportalo más liviano.' },
      { status: 413 }
    );
  }

  const tamanoBytes = Math.floor(datosBase64.length * 0.75);
  const [archivo] = await db
    .insert(comprobantes)
    .values({ cotizacionId: id, nombreArchivo, mime, tamanoBytes, datosBase64, subidoPor: session.nombre })
    .returning({ id: comprobantes.id });

  await db.update(cotizaciones).set({ updatedAt: new Date() }).where(eq(cotizaciones.id, id));

  return NextResponse.json({ comprobanteId: archivo.id, estadoPago: cot.estadoPago });
}
