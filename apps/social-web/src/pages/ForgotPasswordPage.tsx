import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/auth/AuthLayout';
import { FieldError, isValidEmail } from '../components/auth/validation';
import { Button, Input, Label } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function ForgotPasswordPage() {
  const { requestPasswordReset, configured } = useAuth();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) {
      setEmailError('Email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError('');
    setLoading(true);
    try {
      await requestPasswordReset(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setInfo('If an account exists for that email, a reset link is on the way.');
      push('Reset email sent (if the account exists).', 'info');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a secure link to choose a new password">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError('');
            }}
          />
          <FieldError message={emailError} />
        </div>
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        {info ? <p className="text-sm font-semibold text-success">{info}</p> : null}
        <Button className="w-full" type="submit" disabled={loading || !configured}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
