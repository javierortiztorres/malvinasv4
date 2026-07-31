// Carga inicial: 65 tintas + excipientes + operadores.
// Idempotente: omite tablas que ya tengan datos.
// Producción: npm run db:seed
// Docker:     se ejecuta automáticamente en docker-entrypoint.sh
import 'dotenv/config';
import tintasSeed from './tintas-seed.json';

const url = process.env.DATABASE_URL!;
const isNeon = url.includes('neon.tech') || url.includes('neon.database');

async function buildDb() {
  if (isNeon) {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    const { excipientesRotulo, operadores, tintas } = await import('../src/db/schema');
    return { db: drizzle(neon(url)), excipientesRotulo, operadores, tintas };
  }
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { excipientesRotulo, operadores, tintas } = await import('../src/db/schema');
  return { db: drizzle(postgres(url)), excipientesRotulo, operadores, tintas };
}

async function main() {
  const { db, excipientesRotulo, operadores, tintas } = await buildDb();

  // Excipientes
  const excExistentes = await (db as any).select().from(excipientesRotulo);
  if (excExistentes.length === 0) {
    await (db as any).insert(excipientesRotulo).values([
      { nombre: 'PEG 4000' },
      { nombre: 'Agua bidestilada' },
      { nombre: 'Cera carnauba' },
      { nombre: 'Aceite de girasol' },
      { nombre: 'Propilenglicol' },
    ]);
    console.log('✔ Excipientes cargados');
  } else {
    console.log(`· Excipientes ya presentes (${excExistentes.length}), omitiendo`);
  }

  // Operadores
  const opExistentes = await (db as any).select().from(operadores);
  if (opExistentes.length === 0) {
    await (db as any).insert(operadores).values([
      { nombre: 'Tomás Palmieri', rol: 'produce' },
      { nombre: 'Julieta Ferrucci', rol: 'produce' },
      { nombre: 'Gonzalo Angeleri', rol: 'produce' },
      { nombre: 'DT: Farm. Gonzalo A. Azategui MP 8288', rol: 'revisa' },
    ]);
    console.log('✔ Operadores cargados');
  } else {
    console.log(`· Operadores ya presentes (${opExistentes.length}), omitiendo`);
  }

  // Tintas
  const tintasExistentes = await (db as any).select().from(tintas);
  if (tintasExistentes.length === 0) {
    await (db as any).insert(tintas).values(
      (tintasSeed as any[]).map((t) => ({
        nombre: t.nombre,
        keywords: t.keywords,
        concentracion: t.concentracion,
        ip: t.ip,
        aManopla: t.aManopla,
        ubicacion: t.ubicacion,
        convUnidad: t.convUnidad ?? '',
        convMgPorUnidad: t.convMgPorUnidad ?? null,
        excipientes: t.excipientes,
        parametros: t.parametros,
        alerta: t.alerta,
        poe: t.poe,
      }))
    );
    console.log(`✔ ${(tintasSeed as any[]).length} tintas cargadas`);
  } else {
    console.log(`· Tintas ya presentes (${tintasExistentes.length}), omitiendo`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
