// Paleta de colores bien diferenciables para identificar pacientes.
export const PALETA = [
  { bg: '#fde68a', border: '#d97706', name: 'ámbar' },
  { bg: '#bfdbfe', border: '#2563eb', name: 'azul' },
  { bg: '#bbf7d0', border: '#16a34a', name: 'verde' },
  { bg: '#fbcfe8', border: '#db2777', name: 'rosa' },
  { bg: '#ddd6fe', border: '#7c3aed', name: 'violeta' },
  { bg: '#fed7aa', border: '#ea580c', name: 'naranja' },
  { bg: '#a5f3fc', border: '#0891b2', name: 'cian' },
  { bg: '#d9f99d', border: '#65a30d', name: 'lima' },
  { bg: '#fecaca', border: '#dc2626', name: 'rojo' },
  { bg: '#e5e7eb', border: '#4b5563', name: 'gris' },
];

// Mismo paciente (grupo) => mismo color, estable.
export function colorDeGrupo(grupo: string) {
  let h = 0;
  for (let i = 0; i < grupo.length; i++) h = (h * 31 + grupo.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}
