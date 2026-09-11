export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[12px] bg-surface-2 ${className}`} />;
}

export function SkeletonPost() {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="mb-3 h-4 w-full" />
      <Skeleton className="mb-3 h-4 w-5/6" />
      <Skeleton className="h-52 w-full rounded-[16px]" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4">
      <Skeleton className="mb-3 h-4 w-40" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4">
      <Skeleton className="mb-4 h-28 w-full rounded-[16px]" />
      <div className="flex items-end gap-3">
        <Skeleton className="-mt-10 h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-2 pb-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
