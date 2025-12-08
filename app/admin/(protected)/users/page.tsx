import { getAdminUsers } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { AdminUsersTable } from './AdminUsersTable';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users | Admin | Outcraftly',
  description: 'Manage user accounts and subscriptions across the Outcraftly platform.'
};

export const dynamic = 'force-dynamic';

type SearchParams = {
  page?: string | string[];
  status?: string | string[];
};

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  const pageParam = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const statusParam = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status;

  const page = Number(pageParam ?? '1');
  const statusFilter = statusParam === 'active' || statusParam === 'inactive' ? statusParam : 'all';

  const result = await getAdminUsers({
    page,
    status: statusFilter === 'all' ? undefined : statusFilter
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">User Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review all workspace accounts, monitor trial status, and oversee subscription assignments.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border/60 bg-card p-4"
      >
        <div className="flex flex-col">
          <label htmlFor="status" className="text-sm font-medium text-muted-foreground">
            Account status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="mt-2 w-48 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
          >
            <option value="all">All users</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
        <Button type="submit" className="px-6">
          Apply filters
        </Button>
      </form>

      <AdminUsersTable
        users={result.users}
        pagination={result.pagination}
        statusFilter={statusFilter}
        plans={result.plans}
      />
    </div>
  );
}
