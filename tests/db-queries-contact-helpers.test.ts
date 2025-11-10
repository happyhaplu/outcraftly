import { describe, expect, it, vi } from 'vitest';

import {
  getPaginatedContactsForTeam,
  listContactCustomFieldDefinitions,
  createContactCustomFieldDefinition
} from '@/lib/db/queries';

function createPaginatedSelectBuilder(rows: any[]) {
  const builder: any = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => Promise.resolve(rows))
  };
  return builder;
}

function createCountBuilder(total: number) {
  const builder: any = {
    from: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve([{ value: total }]))
  };
  return builder;
}

function createDefinitionSelectBuilder(rows: any[]) {
  const builder: any = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    execute: vi.fn(() => Promise.resolve(rows))
  };
  return builder;
}

describe('contact query helpers', () => {
  it('paginates contacts with optional filters', async () => {
    const rows = [
      {
        id: '1',
        firstName: 'Alex',
        lastName: 'Chen',
        email: 'alex@example.com',
        company: 'Alex Co',
        jobTitle: 'CTO',
        tags: ['VIP'],
        createdAt: new Date('2024-01-01T00:00:00Z')
      }
    ];

    const selectBuilder = createPaginatedSelectBuilder(rows);
    const countBuilder = createCountBuilder(7);

    const client = {
      select: vi.fn((arg?: any) => {
        if (arg && typeof arg === 'object' && 'value' in arg) {
          return countBuilder;
        }
        return selectBuilder;
      })
    } as any;

    const result = await getPaginatedContactsForTeam(99, {
      search: 'alex',
      tag: 'vip',
      page: 2,
      limit: 10,
      client
    });

    expect(client.select).toHaveBeenCalledTimes(2);
    expect(selectBuilder.limit).toHaveBeenCalledWith(10);
    expect(selectBuilder.offset).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: rows.map((row) => ({
        ...row,
        jobTitle: row.jobTitle,
        tags: row.tags
      })),
      total: 7,
      page: 2,
      totalPages: 1
    });
  });

  it('lists contact custom field definitions for a team', async () => {
    const fieldRows = [
      {
        id: 'fld-1',
        name: 'Plan',
        key: 'plan',
        type: 'text',
        description: 'Billing plan',
        createdAt: new Date('2024-04-01T00:00:00Z'),
        updatedAt: new Date('2024-04-02T00:00:00Z')
      }
    ];

    const selectBuilder = createDefinitionSelectBuilder(fieldRows);

    const client = {
      select: vi.fn(() => selectBuilder)
    } as any;

    const result = await listContactCustomFieldDefinitions(42, client);

    expect(client.select).toHaveBeenCalledTimes(1);
    expect(selectBuilder.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fieldRows);
  });

  it('creates a new contact custom field definition', async () => {
    const returningMock = vi.fn(() => Promise.resolve([
      {
        id: 'fld-2',
        teamId: 42,
        name: 'Region',
        key: 'region',
        type: 'text',
        description: null
      }
    ]));

    const valuesMock = vi.fn(() => ({ returning: returningMock }));

    const client = {
      insert: vi.fn(() => ({ values: valuesMock })),
      select: vi.fn(() => {
        const builder: any = {
          from: vi.fn(() => builder),
          where: vi.fn(() => builder),
          execute: vi.fn(() => Promise.resolve([]))
        };
        return builder;
      })
    } as any;

    const result = await createContactCustomFieldDefinition(
      42,
      { name: 'Region', key: 'region', type: 'text', description: undefined },
      client
    );

    expect(client.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
  const insertedPayload = (valuesMock.mock.calls[0] as any[])[0];
    expect(insertedPayload).toMatchObject({
      teamId: 42,
      name: 'Region',
      key: 'region',
      type: 'text',
      description: null
    });
    expect(insertedPayload).toHaveProperty('createdAt');
    expect(insertedPayload).toHaveProperty('updatedAt');
    expect(returningMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'fld-2', key: 'region' });
  });

  it('returns empty pagination result when no contacts match', async () => {
    const rows: any[] = [];

    const selectBuilder = createPaginatedSelectBuilder(rows);
    const countBuilder = createCountBuilder(0);

    const client = {
      select: vi.fn((arg?: any) => {
        if (arg && typeof arg === 'object' && 'value' in arg) {
          return countBuilder;
        }
        return selectBuilder;
      })
    } as any;

    const result = await getPaginatedContactsForTeam(7, { client });

    expect(result).toEqual({ data: [], total: 0, page: 1, totalPages: 1 });
  });

  it('propagates unique constraint errors when creating duplicate custom fields', async () => {
    const uniqueError: any = new Error('duplicate key');
    uniqueError.code = '23505';

    const insertMock = vi.fn(() => {
      throw uniqueError;
    });

    const client = {
      insert: insertMock,
      select: vi.fn(() => {
        const builder: any = {
          from: vi.fn(() => builder),
          where: vi.fn(() => builder),
          execute: vi.fn(() => Promise.resolve([]))
        };
        return builder;
      })
    } as any;

    await expect(
      createContactCustomFieldDefinition(42, { name: 'Region', key: 'region', type: 'text' }, client)
    ).rejects.toBe(uniqueError);
  });
});
