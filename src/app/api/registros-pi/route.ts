import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get('estado');
  const q = estado
    ? db.select().from(registrosPi).where(eq(registrosPi.estado, estado)).orderBy(desc(registrosPi.createdAt))
    : db.select().from(registrosPi).orderBy(desc(registrosPi.createdAt));
  return NextResponse.json(await q);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db.insert(registrosPi).values(body).returning();
  return NextResponse.json(row);
}
