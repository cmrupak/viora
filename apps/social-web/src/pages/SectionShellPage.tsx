import { Card } from '../components/ui';

export function SectionShellPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Phase 1 layout</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </Card>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[16px] border border-border bg-surface-2 p-4">
              <div className="mb-3 h-28 rounded-[14px] bg-border/70" />
              <p className="text-sm font-semibold text-ink">{title} card {index + 1}</p>
              <p className="mt-1 text-xs text-muted">Structured for later Supabase data.</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
