import { createHmac, timingSafeEqual } from 'crypto';

// Firma del LINK CORTO del checkout propio: HMAC-SHA256("c|{id}") con el
// secreto compartido (CHECKOUT_SECRET, el mismo en malvinasv4 y
// pillar-checkout). Desde v2.2.2 se trunca a 12 hex (pedido de Tomi: "el
// link sigue largo y se presta sospechoso") — 48 bits siguen siendo
// inadivinables por fuerza bruta online, y el checkout valida contra
// Malvinas en cada carga. Los links viejos de 32 hex SIGUEN VALIENDO
// (se aceptan las dos longitudes). La genera link-checkout y la verifica
// checkout-data — conocer el nº de cotización no alcanza.
export function firmaCorta(id: number, secreto: string): string {
  return createHmac('sha256', secreto).update(`c|${id}`).digest('hex').slice(0, 12);
}

export function firmaCortaValida(id: number, t: string, secreto: string): boolean {
  const completa = createHmac('sha256', secreto).update(`c|${id}`).digest('hex');
  // 12 (nueva) o 32 (links ya mandados) — comparación timing-safe en ambas.
  for (const esperada of [completa.slice(0, 12), completa.slice(0, 32)]) {
    const a = Buffer.from(esperada);
    const b = Buffer.from(t);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
