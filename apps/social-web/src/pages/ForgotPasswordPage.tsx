import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@viora/core';
import { AuthLayout } from '../components/auth/AuthLayout';
import { FieldError, isValidEmail } from '../components/auth/validation';
import { Button, Input, Label } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { passwordOtpRequest } from '../lib/passwordOtp';

type Step = 'email' | 'otp';

export function ForgotPasswordPage() {
  const { push } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode() {
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
      const result = await passwordOtpRequest({ action: 'send', email });
      setInfo(result.message);
      setStep('otp');
      push('Check your email for a 6-digit code.', 'info');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSendCode(event: FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }
    setOtpError('');
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordError('');
    setLoading(true);
    try {
      const result = await passwordOtpRequest({
        action: 'reset',
        email,
        otp: otp.trim(),
        password,
      });
      push(result.message, 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle={
        step === 'email'
          ? "We'll email you a one-time code to set a new password"
          : 'Enter the code from your email and choose a new password'
      }
      showGetApp
    >
      {step === 'email' ? (
        <form onSubmit={(e) => void onSendCode(e)} className="space-y-4" noValidate>
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
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void onReset(e)} className="space-y-4" noValidate>
          <p className="rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            Code sent to <span className="font-semibold text-ink">{email}</span>
          </p>
          <div>
            <Label htmlFor="otp">One-time code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                setOtpError('');
              }}
            />
            <FieldError message={otpError} />
          </div>
          <div>
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="pr-11"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
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
            <FieldError message={passwordError} />
          </div>
          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>
          <button
            type="button"
            className="w-full text-sm font-semibold text-primary"
            disabled={loading}
            onClick={() => void sendCode()}
          >
            Resend code
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-primary">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
