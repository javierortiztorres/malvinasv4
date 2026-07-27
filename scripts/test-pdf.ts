import { readFileSync } from 'fs';
import { extractText, getDocumentProxy } from 'unpdf';
import { parseReceta } from '../src/lib/parser';

async function main(path: string, nombre: string) {
  const buf = new Uint8Array(readFileSync(path));
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  console.log('==== TEXTO CRUDO', nombre, '(primeros 600 chars) ====');
  console.log(text.slice(0, 600));
  console.log('==== PARSEADO ====');
  const r = parseReceta(text);
  console.log(JSON.stringify({
    paciente: r.paciente, dni: r.dni, medico: r.medico, matricula: r.matricula,
    fechaReceta: r.fechaReceta, nroReceta: r.nroReceta, diagnostico: r.diagnostico,
    formulas: r.formulas.map(f => ({ titulo: f.titulo, nActivos: f.activos.length, indicacion: f.indicacion, dias: f.dias })),
    advertencias: r.advertencias,
  }, null, 2));
}

(async () => {
  await main('/mnt/user-data/uploads/03_07_2026_Segundo_Juan_Defagot.pdf', 'DEFAGOT');
  await main('/mnt/user-data/uploads/03_07_2026_Pagnan_Monica.pdf', 'PAGNAN');
})();
