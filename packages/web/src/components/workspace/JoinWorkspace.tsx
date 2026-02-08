import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';

export function JoinWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const acceptInvite = useWorkspaceStore((s) => s.acceptInvite);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      navigate(
        `/login?redirect=${encodeURIComponent(`/join?token=${token}`)}`,
        { replace: true },
      );
      return;
    }

    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid invite link');
      return;
    }

    // Guard against double-firing (React StrictMode)
    if (acceptedRef.current) return;
    acceptedRef.current = true;

    acceptInvite(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(
          err.response?.data?.message || 'Failed to accept invite',
        );
      });
  }, [token, isAuthenticated, isLoading, acceptInvite, navigate]);

  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#db4c3f] animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Joining workspace...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-4">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Unable to join
          </h2>
          <p className="text-gray-600 mb-6">{errorMessage}</p>
          <Button onClick={() => navigate('/today')}>Go to Taskflow</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm mx-4">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          You're in!
        </h2>
        <p className="text-gray-600 mb-6">
          You've successfully joined the workspace.
        </p>
        <Button onClick={() => navigate('/today')}>Get started</Button>
      </div>
    </div>
  );
}
