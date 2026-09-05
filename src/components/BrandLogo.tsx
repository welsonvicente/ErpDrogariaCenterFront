export function BrandLogo({ large = false }: { large?: boolean }) {
  return (
    <img
      className={`brand-logo${large ? ' brand-logo--large' : ''}`}
      src="/brand/pharmamind-horizontal.png"
      alt="PharmaMind"
      width="300"
      height="100"
      decoding="async"
    />
  );
}
