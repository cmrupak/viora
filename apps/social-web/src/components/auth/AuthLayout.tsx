import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';

export function AuthLayout({
  title,
  subtitle,
  children,
  showGetApp = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  showGetApp?: boolean;
}) {
  return (
    <div className="dark min-h-screen bg-bg text-ink">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>

          {showGetApp ? (
            <div className="mt-8 flex justify-center">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 text-sm font-semibold text-ink/90 transition hover:text-primary"
              >
                <Smartphone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                Get the app
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
