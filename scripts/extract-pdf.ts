import { extractText, getDocumentProxy } from 'unpdf';
import { readFileSync } from 'fs';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Uso: npx tsx scripts/extract-pdf.ts <path.pdf>'); process.exit(1); }
  const buf = new Uint8Array(readFileSync(file));
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  console.log('=== JSON ===');
  console.log(JSON.stringify(text));
  console.log('\n=== LEGIBLE ===');
  console.log(text);
}

main().catch(console.error);
