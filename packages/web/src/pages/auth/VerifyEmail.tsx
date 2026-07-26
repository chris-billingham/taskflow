import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import api from '@/services/api';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  // Guard against StrictMode double-firing: the token is single-use, so the
  // second request would report "invalid token" after a successful verify.
  const requested = useRef(false);

  useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;

    api
      .get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(
          err.response?.data?.message ||
            'Verification failed. The link may have expired.',
        );
      });
  }, [token]);

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This verification link is invalid">
        <Alert variant="error">
          No verification token found. Use the link from your email, or sign in
          to request a new one.
        </Alert>
        <p className="mt-4 text-sm text-center text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-primary-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Email verification"
      subtitle={status === 'verifying' ? 'Confirming your email address…' : ''}
    >
      {status === 'verifying' && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      )}

      {status === 'success' && (
        <>
          <Alert variant="success">
            Your email address has been verified. You can sign in now.
          </Alert>
          <p className="mt-4 text-sm text-center">
            <Link to="/login" className="text-primary-600 hover:underline">
              Continue to sign in
            </Link>
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <Alert variant="error">{message}</Alert>
          <p className="mt-4 text-sm text-center text-gray-500 dark:text-gray-400">
            <Link to="/login" className="text-primary-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
