import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { comprobantes, cotizaciones, registros } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

const MIMES_VALIDOS = new Set(['image/jpeg', 'image/png', 'application/pdf']);
// El límite de body de las funciones de Vercel es 4.5 MB: con base64
// (+33%) esto deja margen. Las imágenes ya vienen comprimidas del cliente.
const MAX_BASE64_CHARS = 4_800_000; // ~3.5 MB de archivo real

// Subir el comprobante de pago de una cotización. Efectos:
// 1. guarda el archivo (dentro de Neon, tabla aparte),
// 2. marca la cotización como PAGADA (con fecha y quién lo subió),
// 3. libera a Pendientes (producción) los registros que seguían retenidos
//    en Pendiente de pago — si ya habían ido a producción con el botón
//    "sin pago", no los toca: solo queda registrado el pago.
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

  const ahora = new Date();
  const [cotActualizada] = await db
    .update(cotizaciones)
    .set({ estadoPago: 'pagada', pagadaEn: ahora, updatedAt: ahora })
    .where(eq(cotizaciones.id, id))
    .returning();

  await db
    .update(registros)
    .set({ estado: 'pendiente', enProduccion: false, updatedAt: ahora })
    .where(and(eq(registros.cotizacionId, id), eq(registros.estado, 'pendiente_pago')));

  return NextResponse.json({ cotizacion: cotActualizada, comprobanteId: archivo.id });
}
