import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseReceta } from '../src/lib/parser';

const RX_DIR = join(process.cwd(), 'RX');

async function procesarPDF(filePath: string, nombre: string) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`PDF: ${nombre}`);
  console.log('═'.repeat(70));
  try {
    const buf = new Uint8Array(readFileSync(filePath));
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    console.log('── TEXTO CRUDO ──');
    console.log(text);
    console.log('\n── PARSEADO ──');
    const r = parseReceta(text);
    const marca = (v: string | undefined | null) => (!v ? '⚠ VACÍO' : v);
    console.log(`paciente    : ${marca(r.paciente)}`);
    console.log(`dni         : ${marca(r.dni)}`);
    console.log(`medico      : ${marca(r.medico)}`);
    console.log(`matricula   : ${marca(r.matricula)}`);
    console.log(`fechaReceta : ${marca(r.fechaReceta)}`);
    console.log(`nroReceta   : ${marca(r.nroReceta)}`);
    console.log(`diagnostico : ${marca(r.diagnostico)}`);
    console.log(`formulas    : ${r.formulas.length}`);
    r.formulas.forEach((f, i) => {
      console.log(`  [${i}] "${f.titulo}" — ${f.activos.length} activos — indicacion:"${f.indicacion}" — dias:${f.dias} — caps:${f.totalCapsulas}`);
      f.activos.forEach((a) => console.log(`       · ${a.activo}: ${a.dosis} ${a.unidad}`));
    });
    if (r.advertencias.length > 0) {
      console.log(`advertencias: ${r.advertencias.join(' | ')}`);
    }
  } catch (e) {
    console.error(`ERROR procesando ${nombre}:`, e);
  }
}

(async () => {
  const archivos = readdirSync(RX_DIR).filter((f) =>
    f.toLowerCase().endsWith('.pdf')
  );

  const imagenes = readdirSync(RX_DIR).filter((f) =>
    /\.(jpe?g|png)$/i.test(f)
  );

  if (imagenes.length > 0) {
    console.log(`\nIMÁGENES (requieren OCR — omitidas):`);
    imagenes.forEach((f) => console.log(`  · ${f}`));
  }

  for (const archivo of archivos) {
    await procesarPDF(join(RX_DIR, archivo), archivo);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Procesados: ${archivos.length} PDFs | Imágenes omitidas: ${imagenes.length}`);
})();
