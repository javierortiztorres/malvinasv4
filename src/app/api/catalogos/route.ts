import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tintas, excipientesRotulo, medicos, pacientes, operadores } from '@/db/schema';
import { eq } from 'drizzle-orm';

const TABLAS = {
  tintas,
  excipientes: excipientesRotulo,
  medicos,
  pacientes,
  operadores,
} as const;
type Tabla = keyof typeof TABLAS;

export async function GET() {
  const [t, e, m, p, o] = await Promise.all([
    db.select().from(tintas),
    db.select().from(excipientesRotulo),
    db.select().from(medicos),
    db.select().from(pacientes),
    db.select().from(operadores),
  ]);
  t.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return NextResponse.json({ tintas: t, excipientes: e, medicos: m, pacientes: p, operadores: o });
}

async function chequearDuplicado(tabla: Tabla, nombre: string, exceptoId?: number) {
  const t = TABLAS[tabla];
  const existentes = await db.select().from(t);
  return existentes.some(
    (x: any) =>
      x.id !== exceptoId &&
      x.nombre?.trim().toLowerCase() === nombre.trim().toLowerCase()
  );
}

export async function POST(req: NextRequest) {
  const { tabla, ...datos } = await req.json();
  const t = TABLAS[tabla as Tabla];
  if (!t) return NextResponse.json({ error: 'Tabla inválida' }, { status: 400 });
  if (datos.nombre && (await chequearDuplicado(tabla, datos.nombre))) {
    return NextResponse.json(
      { error: `"${datos.nombre}" ya existe. No se permiten duplicados.` },
      { status: 409 }
    );
  }
  const [row] = await db.insert(t).values(datos).returning();
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest) {
  const { tabla, id, ...datos } = await req.json();
  const t = TABLAS[tabla as Tabla];
  if (!t) return NextResponse.json({ error: 'Tabla inválida' }, { status: 400 });
  if (datos.nombre && (await chequearDuplicado(tabla, datos.nombre, id))) {
    return NextResponse.json(
      { error: `"${datos.nombre}" ya existe. No se permiten duplicados.` },
      { status: 409 }
    );
  }
  const [row] = await db.update(t).set(datos).where(eq(t.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const { tabla, id } = await req.json();
  const t = TABLAS[tabla as Tabla];
  if (!t) return NextResponse.json({ error: 'Tabla inválida' }, { status: 400 });
  await db.delete(t).where(eq(t.id, id));
  return NextResponse.json({ ok: true });
}
