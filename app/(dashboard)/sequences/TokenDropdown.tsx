'use client';

import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_PERSONALISATION_TOKENS } from '@/lib/validation/sequence';

const tokenLabels: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  company: 'Company',
  email: 'Email',
  title: 'Job title',
  phone: 'Phone'
};

type TokenDropdownProps = {
  onInsert: (token: string) => void;
  disabled?: boolean;
  align?: 'start' | 'end';
};

export function TokenDropdown({ onInsert, disabled = false, align = 'end' }: TokenDropdownProps) {
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
