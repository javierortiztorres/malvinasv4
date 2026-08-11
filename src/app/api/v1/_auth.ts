import { NextRequest, NextResponse } from 'next/server';

export function checkApiKey(req: NextRequest): NextResponse | null {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API_KEY no configurada en el servidor' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== apiKey) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return null;
}
