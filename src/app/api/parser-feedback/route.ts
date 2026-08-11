import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { parserFeedback } from '@/db/schema';
import type { RecetaParseada } from '@/lib/parser';

export const runtime = 'nodejs';

type FeedbackPayload = {
  textoOriginal: string;
  resultadoParser: Partial<RecetaParseada>;
  resultadoFinal: Partial<RecetaParseada>;
  fuenteIA: boolean;
};

function detectarCorrecciones(inicial: Partial<RecetaParseada>, final: Partial<RecetaParseada>): boolean {
  if (inicial.paciente !== final.paciente) return true;
  if (inicial.medico !== final.medico) return true;
  if (inicial.matricula !== final.matricula) return true;
  if (inicial.diagnostico !== final.diagnostico) return true;
  if (JSON.stringify(inicial.formulas) !== JSON.stringify(final.formulas)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body: FeedbackPayload = await req.json();
    const { textoOriginal, resultadoParser, resultadoFinal, fuenteIA } = body;

    if (!resultadoParser || !resultadoFinal) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const huboCorrecciones = detectarCorrecciones(resultadoParser, resultadoFinal);

    await db.insert(parserFeedback).values({
      textoOriginal: textoOriginal ?? '',
      resultadoParser,
      resultadoFinal,
      huboCorrecciones,
      fuenteIA: fuenteIA ?? false,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('parser-feedback:', e);
    return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 });
  }
}
