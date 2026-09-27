import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkspaceActions } from '@/queries/workspaces';
import { useAuthStore } from '@/stores/authStore';
import { useLinkToken } from '@/hooks/useLinkToken';
import { readPendingInvite, setPendingInvite } from '@/utils/pendingInvite';


export function JoinWorkspace() {
  const navigate = useNavigate();
  const linkToken = useLinkToken();
  // Read once: the held copy is cleared as soon as the invite is submitted,
  // and re-reading it on the next render would turn success into "invalid".
  const [heldToken] = useState(readPendingInvite);
  const token = linkToken ?? heldToken;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { acceptInvite } = useWorkspaceActions();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      setPendingInvite(token);
      navigate(`/login?redirect=${encodeURIComponent('/join')}`, { replace: true });
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

    setPendingInvite(null);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Joining workspace...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="text-center max-w-sm mx-4">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Unable to join
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{errorMessage}</p>
          <Button onClick={() => navigate('/today')}>Go to Taskflow</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
      <div className="text-center max-w-sm mx-4">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          You're in!
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You've successfully joined the workspace.
        </p>
        <Button onClick={() => navigate('/today')}>Get started</Button>
      </div>
    </div>
  );
}
