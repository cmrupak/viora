import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { brand } from '../design/tokens';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui';

export function WelcomePage() {
  const { user, configured } = useAuth();

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe,var(--color-bg)_45%,#eff6ff)] px-4 py-10 dark:bg-[radial-gradient(circle_at_top_left,#1e3a8a,var(--color-bg)_50%,#0b1220)]">
      <div className="w-full max-w-2xl rounded-[24px] border border-border bg-surface/95 p-8 shadow-[var(--shadow-card)] backdrop-blur">
        <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{brand.name}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight font-bold text-ink sm:text-5xl">
          {brand.tagline}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
          Share moments on web and mobile with one account — feed, stories, messages, and more.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={user ? '/feed' : '/login'}>
            <Button>{user ? 'Open home' : 'Get started'}</Button>
          </Link>
          <Link to={configured ? (user ? '/profile' : '/register') : '/setup'}>
            <Button variant="secondary">
              {configured ? (user ? 'Profile' : 'Create account') : 'Connect Supabase'}
            </Button>
          </Link>
          <Link to="/app">
            <Button variant="ghost">
              <Smartphone className="h-4 w-4" />
              Get the app
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
