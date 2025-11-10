import { AlertTriangle, ChevronDown, Loader2, Search } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type WizardContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  tags: string[];
};

export type WizardStepEnrollProspectsProps = {
  contacts: WizardContact[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  tags: string[];
  selectedTag: string;
  onTagChange: (value: string) => void;
  isLoadingTags: boolean;
  tagError: string | null;
};

export function WizardStepEnrollProspects({
  contacts,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  isLoading,
  error,
  searchTerm,
  onSearchTermChange,
  tags,
  selectedTag,
  onTagChange,
  isLoadingTags,
  tagError
}: WizardStepEnrollProspectsProps) {
  const selectedCount = selectedIds.size;
  const hasTagFilter = isLoadingTags || tags.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground">
            {contacts.length} matching contacts
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {selectedCount} selected
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-full border border-border/60 bg-background px-3 py-1 font-medium text-foreground transition hover:bg-muted"
            onClick={onSelectAll}
            disabled={contacts.length === 0}
          >
            Select all
          </button>
          <button
            type="button"
            className="rounded-full border border-transparent bg-transparent px-3 py-1 font-medium text-muted-foreground transition hover:text-foreground"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search by name, email, or company"
            className="pl-9"
          />
        </div>

        {hasTagFilter ? (
          <div className="flex min-w-[220px] flex-1 flex-col gap-2 md:max-w-xs">
            <Label htmlFor="wizard-tag-filter">Filter by tag</Label>
            <div className="relative">
              <select
                id="wizard-tag-filter"
                className="w-full appearance-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={selectedTag}
                onChange={(event) => onTagChange(event.target.value)}
                disabled={isLoadingTags || !!tagError || tags.length === 0}
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>
            {isLoadingTags ? (
              <span className="text-xs text-muted-foreground">Loading tags…</span>
            ) : tags.length === 0 && !tagError ? (
              <span className="text-xs text-muted-foreground">No tags available yet.</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {tagError ? (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {tagError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading contacts...
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {error}
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          No contacts found. Try clearing filters or enrolling new contacts.
        </div>
      ) : (
        <ul className="grid gap-3">
          {contacts.map((contact) => {
            const isSelected = selectedIds.has(contact.id);
            const nameParts = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
            const displayName = nameParts.length > 0 ? nameParts : contact.email;

            return (
              <li
                key={contact.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm transition-colors hover:border-primary/40"
              >
                <label className="flex flex-1 items-center gap-3" htmlFor={`wizard-contact-${contact.id}`}>
                  <Checkbox
                    id={`wizard-contact-${contact.id}`}
                    checked={isSelected}
                    onCheckedChange={() => onToggle(contact.id)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{contact.email}</p>
                    {contact.company ? (
                      <p className="truncate text-xs text-muted-foreground/80">{contact.company}</p>
                    ) : null}
                  </div>
                </label>
                {contact.tags && contact.tags.length > 0 ? (
                  <div className="hidden flex-wrap items-center gap-1 sm:flex">
                    {contact.tags.slice(0, 3).map((tag) => (
                      <span
                        key={`${contact.id}-${tag}`}
                        className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {contact.tags.length > 3 ? (
                      <span className="text-[11px] font-semibold text-muted-foreground">+{contact.tags.length - 3}</span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
