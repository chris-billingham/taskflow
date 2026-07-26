import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useAuthStore } from '@/stores/authStore';

// Taskflow ships no Terms or Privacy Policy of its own — the operator of each
// self-hosted instance is the data controller and supplies their own. These
// were previously href="#", so the mandatory consent checkbox pointed at
// nothing. Set the vars to publish real documents; unset, the labels render as
// plain text instead of dead links.
const TERMS_URL = import.meta.env.VITE_TERMS_URL || '';
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL || '';

function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return <span className="text-gray-600">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#db4c3f] hover:text-[#c53727]"
    >
      {children}
    </a>
  );
}

const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function getPasswordStrength(password: string) {
  if (password.length === 0) return { label: '', color: '', width: '0%' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%' };
  if (score <= 2)
    return { label: 'Fair', color: 'bg-orange-500', width: '40%' };
  if (score <= 3)
    return { label: 'Good', color: 'bg-yellow-500', width: '60%' };
  if (score <= 4)
    return { label: 'Strong', color: 'bg-green-500', width: '80%' };
  return { label: 'Very strong', color: 'bg-green-600', width: '100%' };
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const registerUser = useAuthStore((s) => s.register);
  const [error, setError] = useState('');

  const rawRedirect = searchParams.get('redirect');
  const redirect =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch('password', '');
  const strength = getPasswordStrength(password);

  const onSubmit = async (formData: RegisterForm) => {
    try {
      setError('');
      await registerUser(formData.name, formData.email, formData.password);
      navigate(redirect || '/today', { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Registration failed. Please try again.',
      );
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start organizing your tasks today"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          icon={<User className="w-4 h-4" />}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            icon={<Lock className="w-4 h-4" />}
            error={errors.password?.message}
            {...register('password')}
          />
          {password && (
            <div className="mt-2">
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${strength.color} transition-all duration-300 rounded-full`}
                  style={{ width: strength.width }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{strength.label}</p>
            </div>
          )}
        </div>

        <Input
          label="Confirm password"
          type="password"
          placeholder="Repeat your password"
          icon={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-[#db4c3f] focus:ring-[#db4c3f] mt-0.5"
              {...register('acceptTerms')}
            />
            <span className="text-sm text-gray-600">
              I agree to the{' '}
              <LegalLink href={TERMS_URL}>Terms of Service</LegalLink> and{' '}
              <LegalLink href={PRIVACY_URL}>Privacy Policy</LegalLink>
              {!TERMS_URL && !PRIVACY_URL && (
                <>
                  {' '}
                  <span className="text-gray-400">
                    of this instance, as set by its operator
                  </span>
                </>
              )}
            </span>
          </label>
          {errors.acceptTerms && (
            <p className="mt-1 text-sm text-red-600">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Create account
        </Button>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            to={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
            className="text-[#db4c3f] hover:text-[#c53727] font-medium"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
