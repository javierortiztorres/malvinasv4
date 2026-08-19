import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recetas } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

// Devuelve el ARCHIVO de la receta (PDF o imagen) para verla en el
// navegador — único lugar donde el base64 sale de la base, igual que los
// comprobantes. La ven Admin (📒 Seguimiento) y Atención.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const [archivo] = await db.select().from(recetas).where(eq(recetas.id, Number(params.id)));
  if (!archivo) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const bytes = Buffer.from(archivo.datosBase64, 'base64');
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': archivo.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(archivo.nombreArchivo || 'receta').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
