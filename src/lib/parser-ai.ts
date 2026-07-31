import { z } from 'zod';
import type { RecetaParseada } from './parser';
import type { EjemploParser } from './parser-examples';

const schemaRecetaParseada = z.object({
  paciente: z.string().default(''),
  dni: z.string().default(''),
  medico: z.string().default(''),
  matricula: z.string().default(''),
  fechaReceta: z.string().default(''),
  nroReceta: z.string().default(''),
  diagnostico: z.string().default(''),
  formulas: z.array(z.object({
    titulo: z.string(),
    activos: z.array(z.object({
      activo: z.string(),
      dosis: z.number(),
      unidad: z.string(),
    })),
    indicacion: z.string(),
    dias: z.number().nullable(),
    totalCapsulas: z.number().nullable(),
  })),
  advertencias: z.array(z.string()).default([]),
});

const RECETA_VACIA = (advertencias: string[]): RecetaParseada => ({
  paciente: '', dni: '', medico: '', matricula: '',
  fechaReceta: '', nroReceta: '', diagnostico: '',
  formulas: [], advertencias,
});

export async function parseRecetaIA(
  texto: string,
  ejemplos: EjemploParser[],
  opciones?: { apiKey?: string; model?: string }
): Promise<RecetaParseada> {
  const apiKey = opciones?.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return RECETA_VACIA(['IA: clave API no configurada']);

  const model = opciones?.model ?? 'deepseek/deepseek-v4-flash';
  const ejemplosFewShot = ejemplos
    .filter((e) => e.esperado.formulas?.some((f) => f.activos && f.activos.length > 0))
    .slice(0, 2);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: construirPrompt(texto, ejemplosFewShot) }],
        max_tokens: 1500,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return RECETA_VACIA([`IA: error HTTP ${response.status}`]);

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();
    if (!rawContent) return RECETA_VACIA(['IA: sin contenido en la respuesta']);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return RECETA_VACIA(['IA: respuesta no es JSON válido']);
    }

    const result = schemaRecetaParseada.safeParse(parsed);
    if (!result.success) return RECETA_VACIA(['IA: respuesta con formato inválido']);

    return result.data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError')
      return RECETA_VACIA(['IA: timeout']);
    return RECETA_VACIA(['IA: error desconocido']);
  }
}

function construirPrompt(textoReceta: string, ejemplos: EjemploParser[]): string {
  const bloqueEjemplos = ejemplos
    .map((e) => {
      const truncado = e.texto.length > 1500 ? e.texto.slice(0, 1500) + '...' : e.texto;
      return `Receta:\n${truncado}\n\nResultado:\n${JSON.stringify(e.esperado)}`;
    })
    .join('\n\n---\n\n');

  return `Extraé los campos de esta receta médica argentina en JSON puro (sin markdown).

Schema requerido:
{
  "paciente": string,
  "dni": string,
  "medico": string,
  "matricula": string,
  "fechaReceta": string,
  "nroReceta": string,
  "diagnostico": string,
  "formulas": [{
    "titulo": string,
    "activos": [{ "activo": string, "dosis": number, "unidad": string }],
    "indicacion": string,
    "dias": number | null,
    "totalCapsulas": number | null
  }],
  "advertencias": string[]
}
${bloqueEjemplos ? `\nEjemplos:\n\n${bloqueEjemplos}\n\n---\n` : ''}
Receta a procesar:
${textoReceta}`.trim();
}

export function mergeResultados(regex: RecetaParseada, ia: RecetaParseada): RecetaParseada {
  const s = (a: string, b: string) => (a || b).trim();

  const activosRegex = regex.formulas.reduce((n, f) => n + (f.activos?.length ?? 0), 0);
  const activosIA = ia.formulas.reduce((n, f) => n + (f.activos?.length ?? 0), 0);

  const setRegex = new Set(regex.advertencias);
  const advIA = ia.advertencias.filter((w) => !setRegex.has(w)).map((w) => `[IA] ${w}`);

  return {
    paciente: s(regex.paciente, ia.paciente),
    dni: s(regex.dni, ia.dni),
    medico: s(regex.medico, ia.medico),
    matricula: s(regex.matricula, ia.matricula),
    fechaReceta: s(regex.fechaReceta, ia.fechaReceta),
    nroReceta: s(regex.nroReceta, ia.nroReceta),
    diagnostico: s(regex.diagnostico, ia.diagnostico),
    formulas: activosIA > activosRegex ? ia.formulas : regex.formulas,
    advertencias: [...regex.advertencias, ...advIA],
  };
}
