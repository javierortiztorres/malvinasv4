import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { desc, eq, isNotNull, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const poe = req.nextUrl.searchParams.get('poe') ?? '';
  const rows = await db
    .select({ n: registrosPi.loteNumero })
    .from(registrosPi)
    .where(and(eq(registrosPi.poe, poe), isNotNull(registrosPi.loteNumero)))
    .orderBy(desc(registrosPi.loteNumero))
    .limit(1);
  const ultimo = rows[0]?.n ?? 0;
  return NextResponse.json({ poe, proximo: ultimo + 1, ultimo });
}
