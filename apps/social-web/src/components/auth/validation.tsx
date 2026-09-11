export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validateLogin(input: { email: string; password: string }) {
  const errors: Partial<Record<'email' | 'password', string>> = {};
  if (!input.email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (!input.password) errors.password = 'Password is required.';
  else if (input.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}

export type RegisterField =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'gender'
  | 'customGender'
  | 'email'
  | 'password';

export function validateRegister(input: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Custom' | '';
  customGender: string;
  email: string;
  password: string;
}) {
  const errors: Partial<Record<RegisterField, string>> = {};
  if (!input.firstName.trim()) errors.firstName = 'First name is required.';
  if (!input.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!input.dateOfBirth.trim()) errors.dateOfBirth = 'Date of birth is required.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    errors.dateOfBirth = 'Enter a valid date.';
  } else {
    const dob = new Date(`${input.dateOfBirth}T00:00:00`);
    const now = new Date();
    if (Number.isNaN(dob.getTime()) || dob > now) errors.dateOfBirth = 'Enter a valid date of birth.';
    else {
      const age = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 13) errors.dateOfBirth = 'You must be at least 13 years old.';
    }
  }
  if (!input.gender) errors.gender = 'Select your gender.';
  else if (input.gender === 'Custom' && !input.customGender.trim()) {
    errors.customGender = 'Enter a custom gender.';
  }
  if (!input.email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (!input.password) errors.password = 'Password is required.';
  else if (input.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-semibold text-danger">{message}</p>;
}
