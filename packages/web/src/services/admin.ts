import api from '@/services/api';
import type { SystemRole } from '@/stores/authStore';
import type { AdminStats as ContractAdminStats, AdminUser as ContractAdminUser, AdminUserPage as ContractAdminUserPage } from '@taskflow/contract';

export type AdminUser = ContractAdminUser;

export type AdminUserPage = ContractAdminUserPage;

export type AdminStats = ContractAdminStats;

export async function fetchStats(): Promise<AdminStats> {
  const { data } = await api.get('/admin/stats');
  return data.data;
}

export async function fetchUsers(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUserPage> {
  const { data } = await api.get('/admin/users', { params });
  return data.data;
}

export async function createUser(input: {
  email: string;
  name: string;
  password?: string;
  role?: SystemRole;
}): Promise<{ user: AdminUser; temporaryPassword: string | null }> {
  const { data } = await api.post('/admin/users', input);
  return data.data;
}

export async function setUserRole(id: string, role: SystemRole): Promise<AdminUser> {
  const { data } = await api.patch(`/admin/users/${id}/role`, { role });
  return data.data;
}

export async function setUserActive(id: string, isActive: boolean): Promise<AdminUser> {
  const { data } = await api.patch(`/admin/users/${id}/status`, { isActive });
  return data.data;
}

export async function resetUserPassword(
  id: string,
  password?: string,
): Promise<{ temporaryPassword: string | null; message: string }> {
  const { data } = await api.post(
    `/admin/users/${id}/password`,
    password ? { password } : {},
  );
  return data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`);
}

/** Pulls the server's message out of an axios error, with a usable fallback. */
export function adminErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message ?? fallback;
}

export type RegistrationMode = 'invite' | 'open';

export async function fetchSettings(): Promise<{ registrationMode: RegistrationMode }> {
  const { data } = await api.get('/admin/settings');
  return data.data;
}

export async function updateSettings(input: {
  registrationMode: RegistrationMode;
}): Promise<{ registrationMode: RegistrationMode }> {
  const { data } = await api.patch('/admin/settings', input);
  return data.data;
}
