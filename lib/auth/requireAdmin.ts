import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUser } from '@/lib/db/queries';
import { User } from '@/lib/db/schema';

export async function requireAdmin(): Promise<User> {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') {
    redirect('/admin/login');
  }

  const user = await getUser();
  if (!user || user.role !== 'admin') {
    redirect('/admin/login');
  }

  return user;
}
