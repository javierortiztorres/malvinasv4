import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseReceta } from '@/lib/parser';
import { parseRecetaIA, mergeResultados } from '@/lib/parser-ai';
import { TODOS_LOS_EJEMPLOS } from '@/lib/parser-examples';
import { db } from '@/db';
import { configuracion } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function getOpenRouterKey(): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(configuracion).where(eq(configuracion.clave, 'openrouter_api_key'));
    return row?.valor || process.env.OPENROUTER_API_KEY;
  } catch {
    return process.env.OPENROUTER_API_KEY;
  }
}

export const runtime = 'nodejs';

// Recibe un PDF (multipart) o texto pegado (JSON {texto}).
// La receta NO se guarda en ningún lado: se procesa en memoria y se descarta.
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let texto = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      texto = text;
    } else {
      const body = await req.json();
      texto = body.texto ?? '';
    }

    if (!texto.trim()) {
      return NextResponse.json(
        {
          error:
            'Este PDF no tiene texto embebido (es una imagen escaneada). Usá el modo "Pegar texto": pasale la receta a una IA y pegá acá el resultado.',
        },
        { status: 400 }
      );
    }

    const resultadoRegex = parseReceta(texto);

    // Si el regex detectó todo bien, devolver directamente
    const necesitaIA =
      resultadoRegex.advertencias.length > 0 ||
      !resultadoRegex.paciente ||
      !resultadoRegex.medico ||
      resultadoRegex.formulas.length === 0;

    if (!necesitaIA) {
      return NextResponse.json(resultadoRegex);
    }

    // Fallback: AI extractor con few-shot del corpus
    const apiKey = await getOpenRouterKey();
    const resultadoIA = await parseRecetaIA(texto, TODOS_LOS_EJEMPLOS, { apiKey });
    const final = mergeResultados(resultadoRegex, resultadoIA);

    // Marcar que el resultado fue asistido por IA
    final._fuenteIA = true;

    return NextResponse.json(final);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error al procesar la receta' }, { status: 500 });
  }
}
