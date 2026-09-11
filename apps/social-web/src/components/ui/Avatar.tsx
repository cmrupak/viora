export function Avatar({
  src,
  name,
  size = 40,
  className = '',
}: {
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-1 ring-border ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid place-items-center rounded-full bg-primary-soft font-bold text-primary ring-1 ring-border ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.36) }}
      aria-label={name || 'Avatar'}
    >
      {initial}
    </div>
  );
}
