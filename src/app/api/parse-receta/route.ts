import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseReceta } from '@/lib/parser';

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
    return NextResponse.json(parseReceta(texto));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error al procesar la receta' }, { status: 500 });
  }
}
