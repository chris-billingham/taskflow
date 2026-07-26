import api from '@/services/api';
import type { SystemRole } from '@/stores/authStore';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: SystemRole;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserPage {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AdminStats {
  total: number;
  active: number;
  suspended: number;
  admins: number;
  unverified: number;
}

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
