import type { Sender } from '@/lib/db/schema';

export type SenderListItem = Pick<
  Sender,
  | 'id'
  | 'name'
  | 'email'
  | 'host'
  | 'port'
  | 'status'
  | 'createdAt'
  | 'username'
  | 'bounceRate'
  | 'quotaUsed'
  | 'quotaLimit'
>;
