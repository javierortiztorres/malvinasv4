import { createHmac, timingSafeEqual } from 'crypto';

// Firma del LINK CORTO del checkout propio: HMAC-SHA256("c|{id}") con el
// secreto compartido (CHECKOUT_SECRET, el mismo en malvinasv4 y
// pillar-checkout), truncado a 32 hex. La genera link-checkout y la
// verifica checkout-data — conocer el nº de cotización no alcanza.
export function firmaCorta(id: number, secreto: string): string {
  return createHmac('sha256', secreto).update(`c|${id}`).digest('hex').slice(0, 32);
}

export function firmaCortaValida(id: number, t: string, secreto: string): boolean {
  const a = Buffer.from(firmaCorta(id, secreto));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}
