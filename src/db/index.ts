import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleServerless, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from 'ws';
import * as schema from './schema';

// Consultas normales: HTTP (sin estado, una conexión por request). Un Pool
// de WebSocket a nivel módulo NO sobrevive al congelamiento de las
// funciones serverless de Vercel entre invocaciones — quedaba con
// conexiones muertas que la siguiente invocación reutilizaba
// ("Connection terminated unexpectedly"). Volver acá exactamente al driver
// de antes de B-08: mismo export, mismo schema, misma variable de entorno.
// cache: 'no-store' (B-12.3): el driver hace la consulta con fetch() y
// Next.js cachea fetch() por defecto en Server Components — force-dynamic
// en la página no alcanza a evitarlo para este fetch de terceros. Sin esto,
// páginas como /pesadas/print podían servir un snapshot viejo de la tabla
// (verificado en prod: un PI recién creado no aparecía en la planilla).
const sql = neon(process.env.DATABASE_URL!, { fetchOptions: { cache: 'no-store' } });
export const db = drizzle(sql, { schema });

neonConfig.webSocketConstructor = ws;

type Tx = Parameters<Parameters<NeonDatabase<typeof schema>['transaction']>[0]>[0];

// Transacciones interactivas: Pool de WebSocket EFÍMERO, uno nuevo por
// llamada, cerrado siempre al terminar. Nunca a nivel módulo — así no hay
// conexión que pueda sobrevivir (ni morir) entre dos invocaciones distintas.
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  try {
    const txDb = drizzleServerless(pool, { schema });
    return await txDb.transaction(fn);
  } finally {
    await pool.end();
  }
}

// Verificación de tipos (nunca se ejecuta): withTransaction con dos updates
// encadenados, para garantizar que compila con autocompletado de drizzle.
async function _verificacionDeTipos() {
  await withTransaction(async (tx) => {
    await tx.update(schema.registros).set({ estado: 'terminado' }).where(eq(schema.registros.id, 1));
    await tx.update(schema.registrosPi).set({ estado: 'terminado' }).where(eq(schema.registrosPi.id, 1));
  });
}
