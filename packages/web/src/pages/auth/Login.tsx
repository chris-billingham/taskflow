import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { useRegistrationOpen } from '@/hooks/useRegistrationOpen';
import { readPendingInvite } from '@/utils/pendingInvite';

const loginSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  // Set when login fails only because the address is unverified — the one
  // failure the user can fix from here, by asking for a fresh link.
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const registrationOpen = useRegistrationOpen();
  // Someone arriving from an invite link may sign up even when sign-up is
  // closed; the server checks the invitation.
  const [hasInvite] = useState(() => readPendingInvite() !== null);
  const offerSignUp = registrationOpen !== false || hasInvite;

  const rawRedirect = searchParams.get('redirect');
  // Only allow relative paths to prevent open redirect attacks
  const redirect =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (formData: LoginForm) => {
    try {
      setError('');
      setUnverified(false);
      setResendState('idle');
      await login(formData.email, formData.password);
      navigate(redirect || '/today', { replace: true });
    } catch (err: any) {
      setUnverified(err.response?.data?.error === 'EMAIL_NOT_VERIFIED');
      setError(err.response?.data?.message || 'Invalid email or password');
    }
  };

  const resendVerification = async () => {
    setResendState('sending');
    try {
      await api.post('/auth/resend-verification', { email: getValues('email') });
    } catch {
      // Rate-limited or offline: the response is deliberately neutral either
      // way, so there is nothing more specific worth showing.
    }
    setResendState('sent');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError('')}>
            {error}
            {unverified && (
              <div className="mt-2">
                {resendState === 'sent' ? (
                  <span>If the address is still unverified, a new link is on its way.</span>
                ) : (
                  <button
                    type="button"
                    className="font-medium underline disabled:opacity-60"
                    disabled={resendState === 'sending'}
                    onClick={resendVerification}
                  >
                    {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
                  </button>
                )}
              </div>
            )}
          </Alert>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          icon={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          icon={<Lock className="w-4 h-4" />}
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between">
          <Link
            to="/forgot-password"
            className="text-sm text-[#db4c3f] hover:text-[#c53727]"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Sign in
        </Button>

        {offerSignUp ? (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don&apos;t have an account?{' '}
            <Link
              to={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register'}
              className="text-[#db4c3f] hover:text-[#c53727] font-medium"
            >
              Sign up
            </Link>
          </p>
        ) : (
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            New accounts are by invitation. Ask an administrator of this Taskflow.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
