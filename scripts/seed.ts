// Carga inicial: 65 tintas de MALVINAS + excipientes + operadores.
// Correr una sola vez: npm run db:seed
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { excipientesRotulo, operadores, tintas } from '../src/db/schema';
import tintasSeed from './tintas-seed.json';

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
  await db.insert(excipientesRotulo).values([
    { nombre: 'PEG 4000' },
    { nombre: 'Agua bidestilada' },
    { nombre: 'Cera carnauba' },
    { nombre: 'Aceite de girasol' },
    { nombre: 'Propilenglicol' },
  ]);

  await db.insert(operadores).values([
    { nombre: 'Tomás Palmieri', rol: 'produce' },
    { nombre: 'Julieta Ferrucci', rol: 'produce' },
    { nombre: 'Gonzalo Angeleri', rol: 'produce' },
    { nombre: 'DT: Farm. Gonzalo A. Azategui MP 8288', rol: 'revisa' },
  ]);

  await db.insert(tintas).values(
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

  console.log(`✔ ${(tintasSeed as any[]).length} tintas + excipientes + operadores cargados`);
}

main();
