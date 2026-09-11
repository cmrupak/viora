import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/auth/AuthLayout';
import { FieldError } from '../components/auth/validation';
import { Button, Input, Label } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function ResetPasswordPage() {
  const { updatePassword, user, configured } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    setFieldError('');
    setLoading(true);
    try {
      await updatePassword(password);
      push('Password updated.', 'success');
      navigate('/feed', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={user ? 'You are signed in via a recovery link. Set your new password below.' : 'Open this page from your password reset email link.'}
    >
      {!configured ? (
        <p className="mb-4 text-sm font-semibold text-danger">Supabase is not configured.</p>
      ) : null}
      {!user ? (
        <p className="mb-4 rounded-[12px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          No recovery session yet. Request a new reset link from{' '}
          <Link to="/forgot-password" className="font-semibold underline">
            Forgot password
          </Link>
          .
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <FieldError message={fieldError} />
        </div>
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={loading || !configured || !user}>
          {loading ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
