import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../mocks/api';

vi.mock('@/services/admin', async () => {
  const actual = await vi.importActual<typeof import('@/services/admin')>(
    '@/services/admin',
  );
  return {
    ...actual,
    fetchUsers: vi.fn(),
    fetchStats: vi.fn(),
    createUser: vi.fn(),
    setUserRole: vi.fn(),
    setUserActive: vi.fn(),
    resetUserPassword: vi.fn(),
    deleteUser: vi.fn(),
  };
});

import * as adminApi from '@/services/admin';
import type { AdminUser } from '@/services/admin';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { ToastContainer } from '@/components/ui/ToastContainer';
import Admin from '@/pages/settings/Admin';
import { SettingsNav } from '@/components/settings/SettingsNav';

const ADMIN_USER: AdminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Ada Admin',
  avatarUrl: null,
  role: 'ADMIN',
  isActive: true,
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  lastLoginAt: '2026-07-20T00:00:00Z',
};

const REGULAR_USER: AdminUser = {
  ...ADMIN_USER,
  id: 'user-2',
  email: 'bob@example.com',
  name: 'Bob User',
  role: 'USER',
  lastLoginAt: null,
};

function signIn(role: 'ADMIN' | 'USER') {
  useAuthStore.setState({
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Ada Admin',
      role,
    },
    isAuthenticated: true,
    isLoading: false,
  });
}

// ToastContainer normally lives in App; the console reports every failure
// through it, so the harness needs it to assert on what the admin actually sees.
const renderPage = () =>
  render(
    <MemoryRouter>
      <Admin />
      <ToastContainer />
    </MemoryRouter>,
  );

beforeEach(() => {
  signIn('ADMIN');
  // The toast store is module state and its duplicate-collapsing would
  // otherwise let one test's message suppress the next test's identical one.
  useToastStore.setState({ toasts: [] });
  vi.mocked(adminApi.fetchUsers).mockResolvedValue({
    users: [ADMIN_USER, REGULAR_USER],
    total: 2,
    page: 1,
    limit: 25,
    pages: 1,
  });
  vi.mocked(adminApi.fetchStats).mockResolvedValue({
    total: 2,
    active: 2,
    suspended: 0,
    admins: 1,
    unverified: 0,
  });
});

describe('admin console access', () => {
  it('renders the user list for an administrator', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    });
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(2);
  });

  it('redirects a non-admin away instead of rendering the console', async () => {
    signIn('USER');

    renderPage();

    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument();
    expect(adminApi.fetchUsers).not.toHaveBeenCalled();
  });
});

describe('settings navigation', () => {
  it('shows the Users entry only to administrators', () => {
    signIn('ADMIN');
    const { unmount } = render(
      <MemoryRouter>
        <SettingsNav />
      </MemoryRouter>,
    );
    expect(screen.getByText('Users')).toBeInTheDocument();
    unmount();

    signIn('USER');
    render(
      <MemoryRouter>
        <SettingsNav />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });
});

describe('user actions', () => {
  async function openMenuFor(name: string) {
    await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(`Actions for ${name}`));
  }

  it('promotes a user to administrator', async () => {
    vi.mocked(adminApi.setUserRole).mockResolvedValue({
      ...REGULAR_USER,
      role: 'ADMIN',
    });

    renderPage();
    await openMenuFor('Bob User');
    fireEvent.click(screen.getByText('Make admin'));

    await waitFor(() => {
      expect(adminApi.setUserRole).toHaveBeenCalledWith('user-2', 'ADMIN');
    });
  });

  it('suspends a user', async () => {
    vi.mocked(adminApi.setUserActive).mockResolvedValue({
      ...REGULAR_USER,
      isActive: false,
    });

    renderPage();
    await openMenuFor('Bob User');
    fireEvent.click(screen.getByText('Suspend account'));

    await waitFor(() => {
      expect(adminApi.setUserActive).toHaveBeenCalledWith('user-2', false);
    });
  });

  it('does not offer suspend or delete on your own row', async () => {
    renderPage();
    await openMenuFor('Ada Admin');

    // Both are refused server-side; the menu must not offer them at all.
    expect(screen.queryByText('Suspend account')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
    // Role and password actions are still available.
    expect(screen.getByText('Reset password')).toBeInTheDocument();
  });

  it('shows a generated password once after a reset', async () => {
    vi.mocked(adminApi.resetUserPassword).mockResolvedValue({
      temporaryPassword: 'Xk7-mQp2-Rt9w',
      message: 'Password reset.',
    });

    renderPage();
    await openMenuFor('Bob User');
    fireEvent.click(screen.getByText('Reset password'));

    await waitFor(() => {
      expect(screen.getByTestId('temporary-password')).toHaveTextContent(
        'Xk7-mQp2-Rt9w',
      );
    });

    // It can be dismissed, and there is no way to bring it back.
    fireEvent.click(screen.getByText('I have saved it — dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('temporary-password')).not.toBeInTheDocument();
    });
  });

  it('requires explicit confirmation before deleting', async () => {
    vi.mocked(adminApi.deleteUser).mockResolvedValue();

    renderPage();
    await openMenuFor('Bob User');
    fireEvent.click(screen.getByText('Delete permanently'));

    // The menu click only arms the confirmation panel.
    expect(adminApi.deleteUser).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Delete Bob User?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Permanently delete'));
    await waitFor(() => {
      expect(adminApi.deleteUser).toHaveBeenCalledWith('user-2');
    });
  });

  it('surfaces a refused delete as an error and keeps the user listed', async () => {
    vi.mocked(adminApi.deleteUser).mockRejectedValue({
      response: {
        data: { message: 'You still own shared workspace(s) with other members' },
      },
    });

    renderPage();
    await openMenuFor('Bob User');
    fireEvent.click(screen.getByText('Delete permanently'));
    await waitFor(() =>
      expect(screen.getByText('Delete Bob User?')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Permanently delete'));

    await waitFor(() => {
      expect(screen.getByText(/still own shared workspace/i)).toBeInTheDocument();
    });
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });
});

describe('creating a user', () => {
  it('shows the generated password returned by the server', async () => {
    vi.mocked(adminApi.createUser).mockResolvedValue({
      user: { ...REGULAR_USER, id: 'user-3', email: 'carol@example.com' },
      temporaryPassword: 'Zz4-Nb8k-Wq3d',
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Bob User')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Add user'));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Carol' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'carol@example.com' },
    });
    fireEvent.click(screen.getByText('Create user'));

    await waitFor(() => {
      expect(adminApi.createUser).toHaveBeenCalledWith({
        email: 'carol@example.com',
        name: 'Carol',
        password: undefined,
        role: 'USER',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('temporary-password')).toHaveTextContent(
        'Zz4-Nb8k-Wq3d',
      );
    });
  });

  it('keeps the form open and shows the reason when creation is refused', async () => {
    vi.mocked(adminApi.createUser).mockRejectedValue({
      response: { data: { message: 'A user with this email already exists' } },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Bob User')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Add user'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dupe' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'bob@example.com' },
    });
    fireEvent.click(screen.getByText('Create user'));

    await waitFor(() => {
      expect(screen.getByText('A user with this email already exists')).toBeInTheDocument();
    });
    // The typed values survive so the admin can correct them.
    expect(screen.getByLabelText('Email')).toHaveValue('bob@example.com');
  });
});
