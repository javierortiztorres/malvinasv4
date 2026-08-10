import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ uid: session.uid, usuario: session.usuario, nombre: session.nombre, rol: session.rol });
}
