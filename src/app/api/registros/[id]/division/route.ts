import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, tintas } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { calcularCapsula, autoUbicarCapas, extrusionCapa } from '@/lib/engine';
import { capsulasSugeridas } from '@/lib/utils';

// División de la dosis en cápsulas — el MISMO botón "Auto / forzar N" del
// editor de registros (ResultadosPanel), expuesto como endpoint para que la
// pantalla de Cotizaciones lo use sin duplicar la lógica en el cliente.
// Replica RegistroEditor.cambiarDivision + actualizarCapas:
//   1. calcularCapsula decide la división (auto por volumen, u override),
//   2. autoUbicarCapas reubica cuerpo/tapa y se recalculan las extrusiones,
//   3. cápsulas totales = días × división (capsulasSugeridas); si el
//      registro no tiene días, se escala el total proporcionalmente.
// Body: { modo: 'auto' } | { modo: 'forzar', capsulasPorToma: 1..6 }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Formulación no toca registros PT; Impresión no puede cambiar división
  // (mismas reglas que el editor / B-30b).
  if (session.rol === 'formulacion' || session.rol === 'impresion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Number(params.id);
  const [r] = await db.select().from(registros).where(eq(registros.id, id));
  if (!r) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const manual = body?.modo === 'forzar';
  const forzado = Number(body?.capsulasPorToma);
  if (manual && (!Number.isInteger(forzado) || forzado < 1 || forzado > 6)) {
    return NextResponse.json({ error: 'División inválida (1 a 6)' }, { status: 400 });
  }

  const capas = r.capas ?? [];
  const res = calcularCapsula(capas, {
    manual,
    capsulasPorToma: manual ? forzado : r.capsulasPorToma,
  });
  const catalogoTintas = await db.select().from(tintas);
  const capasFinal = autoUbicarCapas(capas, res.capsulasPorToma, catalogoTintas).map((c) => ({
    ...c,
    extrusionMl: extrusionCapa(c.dosisMg, c.concentracion, c.ip, res.capsulasPorToma),
  }));

  const sug = capsulasSugeridas(r.dias, res.capsulasPorToma);
  const capsulasTotales =
    sug ??
    (r.capsulasTotales
      ? Math.round((r.capsulasTotales / (r.capsulasPorToma || 1)) * res.capsulasPorToma)
      : r.capsulasTotales);

  const [row] = await db
    .update(registros)
    .set({
      capas: capasFinal,
      capsulasPorToma: res.capsulasPorToma,
      capsulasPorTomaManual: manual,
      capsulasTotales,
      aprobadas: capsulasTotales,
      updatedAt: new Date(),
    })
    .where(eq(registros.id, id))
    .returning();

  return NextResponse.json({ registro: row, capsulasPorTomaAuto: res.capsulasPorTomaAuto });
}
