import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Mail, Lock, KeyRound } from 'lucide-react';
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

/** Step two for an account with two-factor sign-in. */
function SecondFactor({
  challengeToken,
  onSignedIn,
  onExpired,
}: {
  challengeToken: string;
  onSignedIn: () => void;
  onExpired: (message: string) => void;
}) {
  const completeTwoFactor = useAuthStore((s) => s.completeTwoFactor);
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await completeTwoFactor(challengeToken, useRecovery ? { recoveryCode: value } : { code: value });
      onSignedIn();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.error === 'CHALLENGE_EXPIRED') return onExpired(data.message);
      setError(data?.message || 'That code isn’t right.');
      setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <Alert variant="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {useRecovery
          ? 'Enter one of the recovery codes you saved when you set up two-factor sign-in. Each works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      <Input
        key={useRecovery ? 'recovery' : 'code'}
        label={useRecovery ? 'Recovery code' : 'Code'}
        autoFocus
        autoComplete="one-time-code"
        inputMode={useRecovery ? 'text' : 'numeric'}
        placeholder={useRecovery ? 'abcde-23456' : '123456'}
        icon={<KeyRound className="w-4 h-4" />}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" isLoading={submitting} className="w-full">
        Verify
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-primary-500 hover:text-primary-600"
        onClick={() => {
          setUseRecovery(!useRecovery);
          setValue('');
          setError('');
        }}
      >
        {useRecovery ? 'Use a code from your app instead' : 'Use a recovery code instead'}
      </button>
    </form>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  // Set when login fails only because the address is unverified — the one
  // failure the user can fix from here, by asking for a fresh link.
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  // Set once the password is right on an account with two-factor sign-in.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
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
      const challenge = await login(formData.email, formData.password);
      if (challenge) return setChallengeToken(challenge.challengeToken);
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

  if (challengeToken) {
    return (
      <AuthLayout title="Two-factor sign-in" subtitle="One more step to sign in">
        <SecondFactor
          challengeToken={challengeToken}
          onSignedIn={() => navigate(redirect || '/today', { replace: true })}
          onExpired={(message) => {
            setChallengeToken(null);
            setError(message);
          }}
        />
      </AuthLayout>
    );
  }

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
            className="text-sm text-primary-500 hover:text-primary-600"
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
              className="text-primary-500 hover:text-primary-600 font-medium"
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
