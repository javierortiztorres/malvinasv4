import * as schema from './schema';

const url = process.env.DATABASE_URL!;

function isNeonUrl(u: string) {
  return u.includes('neon.tech') || u.includes('neon.database');
}

function createDb() {
  if (isNeonUrl(url)) {
    // Producción: Neon serverless via HTTP
    const { neon } = require('@neondatabase/serverless');
    const { drizzle } = require('drizzle-orm/neon-http');
    return drizzle(neon(url), { schema });
  }
  // Local (Docker): PostgreSQL estándar via TCP
  const postgres = require('postgres');
  const { drizzle } = require('drizzle-orm/postgres-js');
  return drizzle(postgres(url), { schema });
}

export const db = createDb();
