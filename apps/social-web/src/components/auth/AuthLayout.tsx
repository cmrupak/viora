import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../../design/tokens';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary-dark to-[#0f172a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <Link to="/" className="font-[family-name:var(--font-display)] text-3xl font-bold">
            {brand.name}
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/80">{brand.tagline}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <p className="text-lg font-semibold">Share moments. Stay close.</p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              A modern social home for stories, friends, and conversations — built for web and mobile together.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs font-semibold text-white/80">
            <div className="rounded-xl bg-white/10 px-3 py-4">Feed</div>
            <div className="rounded-xl bg-white/10 px-3 py-4">Stories</div>
            <div className="rounded-xl bg-white/10 px-3 py-4">Messages</div>
          </div>
        </div>
        <p className="text-xs text-white/50">Original product UI · Phase 2 auth</p>
      </aside>

      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-block font-[family-name:var(--font-display)] text-3xl font-bold text-primary lg:hidden">
            {brand.name}
          </Link>
          <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
