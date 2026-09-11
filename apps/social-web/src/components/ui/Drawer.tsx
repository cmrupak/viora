import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export function Drawer({
  open,
  title,
  children,
  onClose,
  side = 'right',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  side?: 'left' | 'right';
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40" aria-label="Close drawer" onClick={onClose} />
      <aside
        className={`absolute top-0 flex h-full w-full max-w-md flex-col border-border bg-surface p-5 shadow-[var(--shadow-card)] ${
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
