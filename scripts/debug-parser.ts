import { extractText, getDocumentProxy } from 'unpdf';
import { readFileSync } from 'fs';
import { parseReceta, segmentarTexto } from '../src/lib/parser';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Uso: npx tsx scripts/debug-parser.ts <path.pdf>'); process.exit(1); }
  const buf = new Uint8Array(readFileSync(file));
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });

  console.log('=== TEXTO SEGMENTADO ===');
  const seg = segmentarTexto(text);
  seg.split('\n').forEach((l, i) => l.trim() && console.log(`${i}: ${l.trim()}`));

  console.log('\n=== RESULTADO PARSER ===');
  const r = parseReceta(text);
  console.log(JSON.stringify(r, null, 2));
}

main().catch(console.error);
