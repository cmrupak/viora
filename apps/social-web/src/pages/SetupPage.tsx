import { Link } from 'react-router-dom';
import { brand } from '../design/tokens';
import { Button, Card } from '../components/ui';

export function SetupPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <Card className="w-full max-w-xl p-6 sm:p-8">
        <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-primary">{brand.name}</p>
        <h1 className="mt-4 text-2xl font-bold text-ink">Connect Supabase</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Add your project URL and anon key. Never use the service-role key in the client apps.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>
            Web: <code className="text-ink">apps/social-web/.env</code> with <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>
          </li>
          <li>
            Mobile: <code className="text-ink">apps/social/.env</code> with <code>EXPO_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>EXPO_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
          <li>Enable Email auth in Supabase Authentication → Providers</li>
        </ol>
        <div className="mt-6">
          <Link to="/">
            <Button>Back to welcome</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
