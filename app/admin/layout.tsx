import { ReactNode } from 'react';

export const metadata = {
  title: 'Admin | Outcraftly'
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
