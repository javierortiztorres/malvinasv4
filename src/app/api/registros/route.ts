import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, medicos, pacientes, cotizaciones } from '@/db/schema';
import { eq, desc, and, gte, lte, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { hoyISO, addDiasISO, addDiasHabilesISO, inicioSemanaISO } from '@/lib/utils';
import { lineasDesdeRegistros } from '@/lib/cotizador';

// Capacidad real del laboratorio (B-31.1): 2 recetas/día, 10 recetas/semana
// (Lun-Dom, mismo corte que Agenda). Arranca en 5 días hábiles desde hoy y
// va corriendo +1 día hábil mientras el día o la semana estén completos.
// Nunca bloquea: siempre devuelve una fecha, por lejana que sea.
const CAPACIDAD_POR_DIA = 2;
const CAPACIDAD_POR_SEMANA = 10;

async function calcularDeadlineAuto(): Promise<string> {
  let candidato = addDiasHabilesISO(hoyISO(), 5);
  for (;;) {
    const delDia = await db.select({ id: registros.id }).from(registros).where(eq(registros.deadline, candidato));
    if (delDia.length >= CAPACIDAD_POR_DIA) {
      candidato = addDiasHabilesISO(candidato, 1);
      continue;
    }
    const inicioSem = inicioSemanaISO(candidato);
    const finSem = addDiasISO(inicioSem, 6);
    const deLaSemana = await db
      .select({ id: registros.id })
      .from(registros)
      .where(and(gte(registros.deadline, inicioSem), lte(registros.deadline, finSem)));
    if (deLaSemana.length + 1 > CAPACIDAD_POR_SEMANA) {
      candidato = addDiasHabilesISO(candidato, 1);
      continue;
    }
    return candidato;
  }
}

// Producto terminado (PT): Formulación no lo usa en ninguna solapa y no
// debe poder verlo ni de este lado (B-30b) — no alcanza con ocultarlo en
// el cliente.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const estado = req.nextUrl.searchParams.get('estado');
  const q = estado
    ? db.select().from(registros).where(eq(registros.estado, estado)).orderBy(desc(registros.createdAt))
    : db.select().from(registros).orderBy(desc(registros.createdAt));
  return NextResponse.json(await q);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];
  const creados = [];
  for (const item of items) {
    // Atención al cliente (branch atencion-cliente): TODO lo que crea entra
    // retenido en "Pendiente de pago" — pasa a Pendientes recién al subir el
    // comprobante o con el botón "a producción sin pago". Se fuerza acá en
    // el server para no depender del cliente (y sin tocar el Lector).
    if (session.rol === 'atencion') {
      item.estado = 'pendiente_pago';
      item.enProduccion = false;
    }
    if (!item.deadline) {
      item.deadline = await calcularDeadlineAuto();
    }
    const [row] = await db.insert(registros).values(item).returning();
    creados.push(row);
    if (item.medico) {
      const ya = await db.select().from(medicos).where(eq(medicos.nombre, item.medico));
      if (ya.length === 0)
        await db.insert(medicos).values({ nombre: item.medico, matricula: item.matricula ?? '' });
    }
    if (item.paciente) {
      const ya = await db.select().from(pacientes).where(eq(pacientes.nombre, item.paciente));
      if (ya.length === 0)
        await db.insert(pacientes).values({ nombre: item.paciente, dni: item.dni ?? '' });
    }
  }

  // Atención: se crea la cotización del grupo en el mismo paso (una sola,
  // cubriendo todas las fórmulas de la receta), lista para ponerle precio.
  if (session.rol === 'atencion' && creados.length > 0) {
    const [cot] = await db
      .insert(cotizaciones)
      .values({
        paciente: creados[0].paciente,
        dni: creados[0].dni,
        grupoPaciente: creados[0].grupoPaciente,
        lineas: lineasDesdeRegistros(creados),
        cotizadoPor: session.nombre,
      })
      .returning();
    await db
      .update(registros)
      .set({ cotizacionId: cot.id })
      .where(inArray(registros.id, creados.map((r) => r.id)));
    for (const r of creados) r.cotizacionId = cot.id;
  }

  return NextResponse.json(creados);
}
