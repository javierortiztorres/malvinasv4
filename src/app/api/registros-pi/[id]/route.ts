import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { faltantesPI } from '@/lib/validation';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'impresion' || session.rol === 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const [row] = await db.select().from(registrosPi).where(eq(registrosPi.id, Number(params.id)));
  if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'impresion' || session.rol === 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = Number(params.id);
  const body = await req.json();
  const terminar = req.nextUrl.searchParams.get('terminar') === '1';

  delete body.id;
  delete body.createdAt;
  // El estado de archivado SOLO se cambia por /archivar (ver el comentario
  // en el PUT de /api/registros/[id]).
  delete body.archivado;
  delete body.archivadoEn;
  delete body.archivadoPor;
  body.updatedAt = new Date();

  if (terminar) {
    const faltan = faltantesPI(body);
    if (faltan) {
      return NextResponse.json({ error: 'Registro incompleto', faltantes: faltan }, { status: 422 });
    }
    body.estado = 'terminado';
  }

  const [row] = await db.update(registrosPi).set(body).where(eq(registrosPi.id, id)).returning();
  return NextResponse.json(row);
}

// El DELETE se quitó a propósito (v2.1.3): los lotes de PI ya no se
// eliminan, se ARCHIVAN — ver ./archivar/route.ts. Sin el export, Next
// devuelve 405 a cualquier DELETE. (El único delete que queda en PI es el
// rollback interno del POST cuando no se pudo numerar el lote recién
// insertado: esa fila nunca llegó a existir para nadie.)
