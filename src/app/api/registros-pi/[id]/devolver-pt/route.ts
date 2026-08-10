import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, registrosPi } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { estadoPT, puedeTransicionar } from '@/lib/estadoPT';
import { coincideLotePI } from '@/lib/utils';

// Devolución automática por lote (B-31): Formulación detecta un problema
// con un lote de PI (falta un activo, error en el PI) y devuelve a
// Pre-producción TODOS los PT en Producción cuya capa referencia ese lote
// — por texto, como ya se correlacionan hoy — sin que Formulación llegue a
// ver ningún dato de esos registros PT (nombre de paciente, DNI, etc. son
// terreno vedado para su rol desde B-30b). Solo se informa una cantidad.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeTransicionar(session.rol, 'en_produccion', 'pre_produccion')) {
    return NextResponse.json({ error: 'No tenés permiso para esta acción' }, { status: 403 });
  }

  const [pi] = await db.select().from(registrosPi).where(eq(registrosPi.id, Number(params.id)));
  if (!pi) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const todos = await db.select().from(registros);
  const objetivo = todos.filter(
    (r) =>
      estadoPT(r) === 'en_produccion' &&
      (r.capas ?? []).some((c) => coincideLotePI(c.lote, pi.poe, pi.loteNumero))
  );

  const ahora = new Date();
  for (const r of objetivo) {
    await db
      .update(registros)
      .set({
        estado: 'pre_produccion',
        enProduccion: false,
        fechaHoraInicio: '',
        devueltoPor: session.nombre,
        devueltoEn: ahora,
        updatedAt: ahora,
      })
      .where(eq(registros.id, r.id));
  }

  return NextResponse.json({ ok: true, cantidad: objetivo.length });
}
