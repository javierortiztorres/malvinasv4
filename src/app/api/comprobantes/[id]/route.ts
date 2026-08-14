import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { comprobantes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Devuelve el ARCHIVO del comprobante (imagen o PDF) para verlo en el
// navegador. Es el único lugar donde el base64 sale de la base — las
// listas y el detalle de cotización solo manejan metadatos.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const [archivo] = await db.select().from(comprobantes).where(eq(comprobantes.id, Number(params.id)));
  if (!archivo) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const bytes = Buffer.from(archivo.datosBase64, 'base64');
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': archivo.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(archivo.nombreArchivo || 'comprobante').replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
