import { db } from '@/db';
import { cotizadorConfig, cotizadorDrogas, type LineaCotizacion } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  calcularLineas,
  configCompleta,
  totalesDesdeLineas,
  type CotizadorConfig,
  type Envio,
  type ResultadoLineas,
} from '@/lib/cotizador';

// Helpers del motor que tocan la base — separados de lib/cotizador.ts
// porque ese archivo también lo importan componentes de cliente.

export async function cargarConfig(): Promise<CotizadorConfig> {
  const [fila] = await db.select().from(cotizadorConfig).where(eq(cotizadorConfig.id, 1));
  return configCompleta(fila?.datos);
}

export async function guardarConfig(datos: Record<string, number>): Promise<CotizadorConfig> {
  const [existe] = await db.select({ id: cotizadorConfig.id }).from(cotizadorConfig).where(eq(cotizadorConfig.id, 1));
  if (existe) {
    await db.update(cotizadorConfig).set({ datos, updatedAt: new Date() }).where(eq(cotizadorConfig.id, 1));
  } else {
    await db.insert(cotizadorConfig).values({ id: 1, datos });
  }
  return configCompleta(datos);
}

export type CotizacionCalculada = ResultadoLineas & {
  config: CotizadorConfig;
  totales: { sugerido: number; precioTotal: number; precioTransferencia: number } | null;
};

// Calcula precios para un juego de líneas con la config y la lista de
// drogas VIGENTES. No escribe nada: cada ruta decide qué persistir.
export async function cotizarLineas(lineasBase: LineaCotizacion[], envio: Envio): Promise<CotizacionCalculada> {
  const [drogas, config] = await Promise.all([
    db.select().from(cotizadorDrogas),
    cargarConfig(),
  ]);
  const resultado = calcularLineas(lineasBase, drogas, config);
  const totales = totalesDesdeLineas(resultado.lineas, config, envio);
  return { ...resultado, config, totales };
}

// Snapshot de parámetros que se guarda en la cotización: qué config y
// envío se usaron al calcular (congela el contexto del precio).
export function snapshotParametros(calc: CotizacionCalculada, envio: Envio): Record<string, unknown> {
  return {
    motor: 'excel-v1',
    envio,
    config: calc.config,
    faltantes: calc.faltantes,
    calculadoEn: new Date().toISOString(),
  };
}
