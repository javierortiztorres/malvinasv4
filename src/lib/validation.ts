import { z } from 'zod';

// ---------------------------------------------------------------
// Validación ESTRICTA. Si falta cualquier campo, se bloquea el
// paso a TERMINADO. Igual en cliente y servidor.
// ---------------------------------------------------------------

export const registroTerminadoSchema = z.object({
  paciente: z.string().min(1, 'Nombre del paciente'),
  medico: z.string().min(1, 'Nombre del médico'),
  matricula: z.string().min(1, 'Matrícula del médico'),
  indicacion: z.string().min(1, 'Indicación médica'),
  formula: z
    .array(
      z.object({
        activo: z.string().min(1),
        dosis: z.number().positive(),
        unidad: z.string().min(1),
      })
    )
    .min(1, 'Fórmula: al menos un activo'),
  capsulasPorToma: z.number().int().min(1).max(8),
  excipientes: z.array(z.string()).min(1, 'Excipientes: seleccioná al menos uno'),
  capsulasTotales: z.number().int().positive('Cantidad total de cápsulas'),
  capsulasPorEnvase: z.number().int().positive('Cápsulas por envase'),
  envases: z.number().int().positive('Cantidad de envases'),
  tipoEnvase: z.string().min(1, 'Tipo de envase'),
  producto: z.string().min(1, 'Nombre del producto'),
  masaVolumen: z.string().min(1, 'Masa o volumen de las unidades'),
  lotePrefijo: z.string().min(1, 'Prefijo de lote'),
  loteNumero: z.number().int().positive('Número de lote'),
  capas: z
    .array(
      z.object({
        ref: z.number(),
        tinta: z.string().min(1, 'Cada capa necesita su tinta'),
        dosisMg: z.number().positive('Cada capa necesita su dosis en mg'),
        concentracion: z.number().positive('Cada capa necesita concentración'),
        ip: z.number().positive('Cada capa necesita IP'),
        lote: z.string().min(1, 'Cada capa necesita el lote del producto intermedio'),
        extrusionMl: z.number().positive('Extrusión calculada faltante'),
      }).passthrough()
    )
    .min(1, 'Capas: al menos una tinta con dosis, lote y extrusión'),
  aprobadas: z.number().int().min(0, 'Unidades aprobadas'),
  rechazadas: z.number().int().min(0),
  fechaHoraInicio: z.string().min(1, 'Fecha y hora de inicio de producción'),
  fechaHoraFin: z.string().min(1, 'Fecha y hora de finalización'),
  operador: z.string().min(1, 'Operador (quién produjo)'),
  supervisor: z.string().min(1, 'Supervisor (quién revisó)'),
  fechaElab: z.string().min(1, 'Fecha de elaboración'),
  fechaVto: z.string().min(1, 'Fecha de vencimiento'),
});

export const registroPiTerminadoSchema = z.object({
  tintaNombre: z.string().min(1, 'Tinta a producir'),
  nombreProducto: z.string().min(1, 'Nombre del producto'),
  poe: z.string().min(1, 'Nº POE (FPI.01.PIxxx)'),
  loteNumero: z.number().int().positive('Número de lote (P…)'),
  cantidadProductoG: z.number().positive('Cantidad de producto (g)'),
  jeringas: z.number().int().positive('Cantidad de jeringas'),
  volumenJeringaMl: z.number().positive('Volumen de jeringa'),
  concentracion: z.number().positive('Concentración del lote'),
  materiasPrimas: z
    .array(
      z.object({
        ref: z.number(),
        nombre: z.string().min(1),
        lote: z.string().min(1, 'Cada materia prima necesita su Nº de lote'),
        cantidadTeorica: z.number().positive(),
        pesadaReal: z.string().min(1, 'Cada materia prima necesita su pesada real'),
      }).passthrough()
    )
    .min(1, 'Materias primas: al menos una'),
  aprobadas: z.number().int().min(0, 'Unidades aprobadas'),
  rechazadas: z.number().int().min(0),
  fechaHoraInicio: z.string().min(1, 'Fecha y hora de inicio'),
  fechaHoraFin: z.string().min(1, 'Fecha y hora de finalización'),
  operador: z.string().min(1, 'Operador'),
  fechaElab: z.string().min(1, 'Fecha de elaboración'),
  fechaVto: z.string().min(1, 'Fecha de vencimiento'),
});

function extraer(schema: z.ZodTypeAny, data: unknown): string[] | null {
  const r = schema.safeParse(data);
  if (r.success) return null;
  const msgs = new Set<string>();
  for (const issue of r.error.issues) {
    msgs.add(
      issue.message === 'Required' || issue.message.startsWith('Expected')
        ? issue.path.join('.')
        : issue.message
    );
  }
  return Array.from(msgs);
}

export function faltantes(data: unknown): string[] | null {
  return extraer(registroTerminadoSchema, data);
}

export function faltantesPI(data: unknown): string[] | null {
  return extraer(registroPiTerminadoSchema, data);
}
