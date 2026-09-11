import type { ReactNode } from 'react';

/** Desktop modal-style sheet; mobile can reuse as bottom panel. */
export function BottomSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40" aria-label="Close sheet" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-[20px] border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:rounded-[20px]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border sm:hidden" />
        <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
