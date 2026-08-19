import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recetas, registros } from '@/db/schema';
import { eq, inArray, isNull, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

const MIMES_VALIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);
// Mismo criterio que los comprobantes: el límite de body de Vercel es
// 4.5 MB; base64 suma ~33%.
const MAX_BASE64_CHARS = 4_800_000; // ~3.5 MB de archivo real

// Guardar una receta (v2.2.0 — decisión de Tomi 14-ago: antes no se
// guardaba nada, ahora queda como respaldo del pedido). Dos caminos:
// - El Lector, al crear los registros desde un PDF: manda registroIds y
//   la receta queda vinculada a esas fórmulas (y a su cotización si ya
//   la tienen).
// - Subida manual desde 📒 Seguimiento (PDF o foto): manda cotizacionId.
// Mismos roles que crear registros (todos menos Formulación).
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nombreArchivo = typeof body.nombreArchivo === 'string' ? body.nombreArchivo.slice(0, 200) : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const datosBase64 = typeof body.datosBase64 === 'string' ? body.datosBase64 : '';
  const registroIds: number[] = Array.isArray(body.registroIds)
    ? body.registroIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const cotizacionId = Number.isInteger(Number(body.cotizacionId)) && Number(body.cotizacionId) > 0
    ? Number(body.cotizacionId)
    : null;

  if (!MIMES_VALIDOS.has(mime)) {
    return NextResponse.json({ error: 'La receta tiene que ser .pdf, .jpg o .png' }, { status: 400 });
  }
  if (!datosBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (datosBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: 'El archivo es muy pesado (máx. ~3.5 MB). Si es PDF, exportalo más liviano.' },
      { status: 413 }
    );
  }
  if (registroIds.length === 0 && cotizacionId === null) {
    return NextResponse.json({ error: 'Falta a qué vincular la receta (registroIds o cotizacionId)' }, { status: 400 });
  }

  // Si vino por registros y alguno ya tiene cotización, la receta queda
  // vinculada también al pedido.
  let cotId = cotizacionId;
  if (cotId === null && registroIds.length > 0) {
    const filas = await db
      .select({ cotizacionId: registros.cotizacionId })
      .from(registros)
      .where(inArray(registros.id, registroIds));
    cotId = filas.find((f) => f.cotizacionId != null)?.cotizacionId ?? null;
  }

  const tamanoBytes = Math.floor(datosBase64.length * 0.75);
  const [receta] = await db
    .insert(recetas)
    .values({
      cotizacionId: cotId,
      nombreArchivo,
      mime,
      tamanoBytes,
      datosBase64,
      subidoPor: session.nombre,
    })
    .returning({ id: recetas.id });

  const ahora = new Date();
  if (registroIds.length > 0) {
    // Solo pisa registros que aún no tenían receta.
    await db
      .update(registros)
      .set({ recetaId: receta.id, updatedAt: ahora })
      .where(and(inArray(registros.id, registroIds), isNull(registros.recetaId)));
  } else if (cotId !== null) {
    await db
      .update(registros)
      .set({ recetaId: receta.id, updatedAt: ahora })
      .where(and(eq(registros.cotizacionId, cotId), isNull(registros.recetaId)));
  }

  return NextResponse.json({ recetaId: receta.id });
}
