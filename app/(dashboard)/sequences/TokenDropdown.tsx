'use client';

import { useMemo } from 'react';

import { Sparkles } from 'lucide-react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { ContactCustomFieldDefinition } from '@/lib/db/schema';
import { SUPPORTED_PERSONALISATION_TOKENS } from '@/lib/validation/sequence';

const tokenLabels: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  company: 'Company',
  email: 'Email',
  jobTitle: 'Job title',
  title: 'Job title',
  phone: 'Phone',
  tags: 'Tags'
};

type CustomFieldRecord = Pick<ContactCustomFieldDefinition, 'id' | 'name' | 'key' | 'type'>;

const fetchCustomFields = async (): Promise<CustomFieldRecord[]> => {
  const response = await fetch('/api/contacts/custom-fields');
  if (!response.ok) {
    throw new Error('Failed to load custom fields');
  }

  const payload = (await response.json()) as { data?: Array<Partial<ContactCustomFieldDefinition>> };
  if (!payload?.data || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .map((item) => ({
      id: String(item?.id ?? ''),
      name: String(item?.name ?? ''),
      key: String(item?.key ?? ''),
      type: (item?.type as ContactCustomFieldDefinition['type']) ?? 'text'
    }))
    .filter((item) => item.id.length > 0 && item.key.length > 0 && item.name.length > 0);
};

type TokenDropdownProps = {
  onInsert: (token: string) => void;
  disabled?: boolean;
  align?: 'start' | 'end';
};

export function TokenDropdown({ onInsert, disabled = false, align = 'end' }: TokenDropdownProps) {
  const { data: customFields } = useSWR<CustomFieldRecord[]>('/api/contacts/custom-fields', fetchCustomFields, {
    revalidateOnFocus: false
  });

  const sortedCustomFields = useMemo(() => {
    if (!customFields) {
      return [] as CustomFieldRecord[];
    }
    return [...customFields].sort((left, right) => left.name.localeCompare(right.name));
  }, [customFields]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={disabled}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Insert token
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[220px]">
        <DropdownMenuLabel>Personalisation tokens</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_PERSONALISATION_TOKENS.map((token) => (
          <DropdownMenuItem key={token} onSelect={() => onInsert(`{{${token}}}`)}>
            <span className="font-medium text-foreground">{tokenLabels[token] ?? token}</span>
            <span className="ml-auto text-xs text-muted-foreground">{`{{${token}}}`}</span>
          </DropdownMenuItem>
        ))}
        {sortedCustomFields.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Custom fields</DropdownMenuLabel>
            {sortedCustomFields.map((field) => {
              const token = `customFields.${field.key}`;
              return (
                <DropdownMenuItem key={field.id} onSelect={() => onInsert(`{{${token}}}`)}>
                  <span className="font-medium text-foreground">{field.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{`{{${token}}}`}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
