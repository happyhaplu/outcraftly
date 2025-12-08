import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from './AdminLoginForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Login | Outcraftly',
  description: 'Administrator access to Outcraftly platform management.'
};

export default async function AdminLoginPage() {
  const session = await getSession();

  if (session?.user.role === 'admin') {
    redirect('/admin/dashboard');
  }

  return <AdminLoginForm />;
}
