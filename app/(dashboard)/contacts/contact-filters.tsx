'use client';

import { useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export type ContactFiltersState = {
  search: string;
  tag: string;
};

type ContactFiltersProps = {
  value: ContactFiltersState;
  onChange: (next: ContactFiltersState) => void;
  availableTags: string[];
};

export function ContactFilters({ value, onChange, availableTags }: ContactFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const hasFilters = value.search.length > 0 || value.tag.length > 0;

  const sortedTags = useMemo(() => {
    return [...new Set(availableTags.map((tag) => tag.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [availableTags]);

  const updateFilters = (next: ContactFiltersState) => {
    onChange(next);

    const params = new URLSearchParams();
    if (next.search.trim().length > 0) {
      params.set('search', next.search.trim());
    }
    if (next.tag.trim().length > 0) {
      params.set('tag', next.tag.trim());
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Input
            value={value.search}
            onChange={(event) => updateFilters({ ...value, search: event.target.value })}
            placeholder="Search by name or email"
            className="pl-9"
          />
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="gap-2">
              <span>{value.tag ? `Tag: ${value.tag}` : 'All tags'}</span>
              {value.tag && <Badge variant="secondary">Active</Badge>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuLabel>Filter by tag</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => updateFilters({ ...value, tag: '' })}>All tags</DropdownMenuItem>
            {sortedTags.length === 0 ? (
              <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
            ) : (
              sortedTags.map((tag) => (
                <DropdownMenuItem key={tag} onSelect={() => updateFilters({ ...value, tag })}>
                  {tag}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        {value.tag && (
          <Badge variant="outline" className="inline-flex items-center gap-1">
            {value.tag}
            <button
              type="button"
              onClick={() => updateFilters({ ...value, tag: '' })}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear tag filter"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </Badge>
        )}
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={() => updateFilters({ search: '', tag: '' })}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
