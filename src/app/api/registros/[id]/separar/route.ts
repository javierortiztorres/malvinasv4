import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, tintas } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { calcularCapsula, autoUbicarCapas, extrusionCapa } from '@/lib/engine';
import { capsulasSugeridas } from '@/lib/utils';
import { normalizarNombre } from '@/lib/cotizador';
import type { CapaTinta } from '@/db/schema';

// SEPARAR ACTIVOS (pedido de Tomi 12-ago): en vez de dividir la DOSIS en
// N cápsulas, se reparten los ACTIVOS en cápsulas distintas — ej. receta
// de 90 días con Vit C 500 mg (ocupa una cápsula entera) + 6 activos
// chicos: 90 cápsulas de Vit C sola y 90 cápsulas con el resto. Siguen
// siendo 180 cápsulas pero cada una lleva la dosis ENTERA de sus activos.
// El endpoint mueve los activos elegidos (con sus capas) a un REGISTRO
// NUEVO para Pendientes — misma receta, mismo estado, misma cotización —
// y recalcula la división y las cápsulas totales de las dos fórmulas.
// Body: { indices: number[] } — posiciones de la fórmula que se van al
// registro nuevo.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion' || session.rol === 'impresion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Number(params.id);
  const [r] = await db.select().from(registros).where(eq(registros.id, id));
  if (!r) return NextResponse.json({ error: 'No existe' }, { status: 404 });

  const formula = r.formula ?? [];
  const body = await req.json().catch(() => ({}));
  const indices: number[] = Array.isArray(body?.indices)
    ? Array.from(new Set<number>(body.indices.map((x: unknown) => Number(x)))).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < formula.length
      )
    : [];
  if (formula.length < 2 || indices.length === 0 || indices.length >= formula.length) {
    return NextResponse.json(
      { error: 'Elegí al menos un activo para separar y dejá al menos uno en la fórmula original' },
      { status: 400 }
    );
  }

  const seVan = new Set(indices);
  const formulaA = formula.filter((_, i) => !seVan.has(i));
  const formulaB = formula.filter((_, i) => seVan.has(i));

  // Las capas siguen a sus activos (por nombre normalizado). Capas sin
  // activo correspondiente (cargadas a mano) se quedan en la original.
  const nombresB = new Set(formulaB.map((a) => normalizarNombre(a.activo)));
  const capas = r.capas ?? [];
  const capasB = capas.filter((c) => nombresB.has(normalizarNombre(c.activoReceta || c.tinta)));
  const capasA = capas.filter((c) => !capasB.includes(c));

  const catalogoTintas = await db.select().from(tintas);
  const preparar = (cs: CapaTinta[]) => {
    const res = calcularCapsula(cs, { manual: false, capsulasPorToma: 1 });
    const finales = autoUbicarCapas(cs, res.capsulasPorToma, catalogoTintas).map((c, i) => ({
      ...c,
      ref: i + 1,
      extrusionMl: extrusionCapa(c.dosisMg, c.concentracion, c.ip, res.capsulasPorToma),
    }));
    // Cápsulas totales = días × división; sin días, se estima con las
    // "tomas" del registro original (totales ÷ división vieja).
    const tomas = r.dias ?? (r.capsulasTotales ? Math.round(r.capsulasTotales / (r.capsulasPorToma || 1)) : null);
    const totales = capsulasSugeridas(tomas, res.capsulasPorToma);
    return { capas: finales, division: res.capsulasPorToma, totales };
  };
  const A = preparar(capasA);
  const B = preparar(capasB);

  // Título de la fórmula nueva: la primera letra libre dentro del grupo
  // (la convención del Lector: A, B, C…). Si la original no tenía, pasa a
  // ser "A" y la nueva toma la siguiente.
  const hermanos = r.grupoPaciente
    ? await db
        .select({ titulo: registros.tituloFormula })
        .from(registros)
        .where(and(eq(registros.grupoPaciente, r.grupoPaciente), ne(registros.id, id)))
    : [];
  const usados = new Set(hermanos.map((h) => (h.titulo || '').toUpperCase()));
  const tituloA = r.tituloFormula || 'A';
  usados.add(tituloA.toUpperCase());
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const tituloB = letras.find((l) => !usados.has(l)) ?? `${tituloA}2`;

  const envasesDe = (totales: number | null) =>
    totales && r.capsulasPorEnvase ? Math.ceil(totales / r.capsulasPorEnvase) : r.envases;

  const [nuevo] = await db
    .insert(registros)
    .values({
      estado: r.estado,
      enProduccion: r.enProduccion,
      grupoPaciente: r.grupoPaciente,
      tituloFormula: tituloB,
      paciente: r.paciente,
      dni: r.dni,
      medico: r.medico,
      matricula: r.matricula,
      fechaReceta: r.fechaReceta,
      nroReceta: r.nroReceta,
      diagnostico: r.diagnostico,
      indicacion: r.indicacion,
      formula: formulaB,
      capsulasPorToma: B.division,
      capsulasPorTomaManual: false,
      excipientes: r.excipientes,
      dias: r.dias,
      capsulasTotales: B.totales ?? null,
      capsulasPorEnvase: r.capsulasPorEnvase,
      envases: envasesDe(B.totales),
      tipoEnvase: r.tipoEnvase,
      producto: r.producto,
      deadline: r.deadline,
      masaVolumen: r.masaVolumen,
      lotePrefijo: r.lotePrefijo,
      loteNumero: null,
      capas: B.capas,
      proceso: r.proceso,
      controles: r.controles,
      aprobadas: B.totales ?? null,
      rechazadas: 0,
      fechaHoraInicio: '',
      fechaHoraFin: '',
      operador: r.operador,
      supervisor: r.supervisor,
      fechaElab: r.fechaElab,
      fechaVto: r.fechaVto,
      cotizacionId: r.cotizacionId,
    })
    .returning();

  const [original] = await db
    .update(registros)
    .set({
      tituloFormula: tituloA,
      formula: formulaA,
      capas: A.capas,
      capsulasPorToma: A.division,
      capsulasPorTomaManual: false,
      capsulasTotales: A.totales ?? r.capsulasTotales,
      aprobadas: A.totales ?? r.aprobadas,
      envases: envasesDe(A.totales),
      updatedAt: new Date(),
    })
    .where(eq(registros.id, id))
    .returning();

  return NextResponse.json({ original, nuevo });
}
