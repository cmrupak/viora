import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { AuthIntroOverlay, useAuthIntro } from '../components/auth/AuthIntro';
import { AuthLayout } from '../components/auth/AuthLayout';
import { FieldError, validateLogin } from '../components/auth/validation';
import { Button, Input, Label } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function LoginPage() {
  const { login, configured } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/feed';
  const { showIntro, text, fading } = useAuthIntro();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'email' | 'password', string>>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await login({ email, password });
      push('Signed in successfully.', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (showIntro) {
    return <AuthIntroOverlay text={text} fading={fading} />;
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to Viora" showGetApp>
      {!configured ? (
        <p className="mb-4 rounded-[12px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          Configure Supabase in <Link to="/setup" className="underline">/setup</Link> first.
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            <button
              type="button"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError message={fieldErrors.password} />
        </div>

        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-primary">
            Forgot password?
          </Link>
        </div>

        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

        <Button className="w-full" type="submit" disabled={loading || !configured}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted uppercase">
        <span className="h-px flex-1 bg-border" />
        OR
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="secondary" className="w-full" disabled>
        Continue with Google
      </Button>
      <p className="mt-2 text-center text-xs text-muted">Google sign-in can be enabled later in Supabase Auth.</p>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-primary">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
