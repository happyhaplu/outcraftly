import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from './AdminLoginForm';

export default async function AdminLoginPage() {
  const session = await getSession();

  if (session?.user.role === 'admin') {
    redirect('/admin/dashboard');
  }

  return <AdminLoginForm />;
}
