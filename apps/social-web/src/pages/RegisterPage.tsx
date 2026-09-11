import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/auth/AuthLayout';
import { FieldError, validateRegister, type RegisterField } from '../components/auth/validation';
import { Button, Input, Label } from '../components/ui';
import { useToast } from '../components/ui/Toast';

type GenderOption = 'Male' | 'Female' | 'Custom' | '';

export function RegisterPage() {
  const { register, configured } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<GenderOption>('');
  const [customGender, setCustomGender] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  function clearField(field: RegisterField) {
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    const errors = validateRegister({
      firstName,
      lastName,
      dateOfBirth,
      gender,
      customGender,
      email,
      password,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const resolvedGender = gender === 'Custom' ? customGender.trim() : gender;

    setLoading(true);
    try {
      const result = await register({
        email,
        password,
        firstName,
        lastName,
        dateOfBirth,
        gender: resolvedGender,
      });
      if (result.needsEmailVerification) {
        setInfo('Check your email to verify your account, then sign in.');
        push('Verification email sent.', 'info');
      } else {
        push('Account created.', 'success');
        navigate('/feed', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Join Viora on web and mobile with one account" showGetApp>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label>Name</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                id="firstName"
                placeholder="First name"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  clearField('firstName');
                }}
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              <FieldError message={fieldErrors.firstName} />
            </div>
            <div>
              <Input
                id="lastName"
                placeholder="Last name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  clearField('lastName');
                }}
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              <FieldError message={fieldErrors.lastName} />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              setDateOfBirth(e.target.value);
              clearField('dateOfBirth');
            }}
            aria-invalid={Boolean(fieldErrors.dateOfBirth)}
          />
          <FieldError message={fieldErrors.dateOfBirth} />
        </div>

        <div>
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            className="h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-sm text-ink outline-none transition focus:border-primary"
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as GenderOption);
              clearField('gender');
              clearField('customGender');
            }}
            aria-invalid={Boolean(fieldErrors.gender)}
          >
            <option value="">Select your gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Custom">Custom</option>
          </select>
          <FieldError message={fieldErrors.gender} />
        </div>

        {gender === 'Custom' ? (
          <div>
            <Label htmlFor="customGender">Custom gender</Label>
            <Input
              id="customGender"
              placeholder="Add custom"
              value={customGender}
              onChange={(e) => {
                setCustomGender(e.target.value);
                clearField('customGender');
              }}
              aria-invalid={Boolean(fieldErrors.customGender)}
            />
            <FieldError message={fieldErrors.customGender} />
          </div>
        ) : null}

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearField('email');
            }}
          />
          <FieldError message={fieldErrors.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="pr-11"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField('password');
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
          <FieldError message={fieldErrors.password} />
        </div>

        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        {info ? <p className="text-sm font-semibold text-success">{info}</p> : null}

        <Button className="w-full" type="submit" disabled={loading || !configured}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
