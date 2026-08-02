import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Driver por WebSocket (Pool), no por HTTP: soporta transacciones
// interactivas (db.transaction), que el módulo de stock va a necesitar.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });

// db.transaction() queda disponible y tipado — verificado acá (no se ejecuta):
if (false) {
  db.transaction(async (tx) => {
    await tx.select().from(schema.tintas).limit(1);
  });
}
