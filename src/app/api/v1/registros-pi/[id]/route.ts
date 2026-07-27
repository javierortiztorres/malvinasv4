import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkApiKey } from '../../_auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const deny = checkApiKey(req);
  if (deny) return deny;

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db.select().from(registrosPi).where(eq(registrosPi.id, id));
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json({ data: row });
}
