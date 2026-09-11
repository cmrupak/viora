export function Badge({
  children,
  className = '',
}: {
  children: string | number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white ${className}`}
    >
      {children}
    </span>
  );
}
