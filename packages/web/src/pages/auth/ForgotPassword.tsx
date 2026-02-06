import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import api from '@/services/api';

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (formData: ForgotForm) => {
    try {
      setError('');
      await api.post('/auth/forgot-password', { email: formData.email });
      setIsSubmitted(true);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send you a link to reset it"
    >
      {isSubmitted ? (
        <div className="space-y-4">
          <Alert variant="success">
            If an account exists with that email, we&apos;ve sent password reset
            instructions.
          </Alert>
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm text-[#db4c3f] hover:text-[#c53727] font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError('')}>
              {error}
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

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Send reset link
          </Button>

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
