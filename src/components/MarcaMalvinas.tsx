// Cápsula 51 — marca principal. Paths exactos del master
// (public/marca/malvinas-capsula-51.svg), recortados al isotipo aislado.
// Los trazados nunca se redibujan: solo cambia el color de la mitad
// constante según la variante oficial del manual (positivo/negativo).
// La mitad personalizada (oro/Tussok) se mantiene siempre igual.
export default function MarcaMalvinas({
  variante = 'positiva',
  className,
}: {
  variante?: 'positiva' | 'negativa';
  className?: string;
}) {
  const colorMitadConstante = variante === 'negativa' ? '#F4F0E6' : '#0E3A4D';
  return (
    <svg viewBox="6 26 88 48" className={className} role="img" aria-label="Malvinas">
      <path d="M 60.57 32 L 31.43 68 L 28 68 A 18 18 0 0 1 28 32 Z" fill={colorMitadConstante} />
      <path d="M 68.57 32 L 72 32 A 18 18 0 0 1 72 68 L 39.43 68 Z" fill="#C1913A" />
    </svg>
  );
}
