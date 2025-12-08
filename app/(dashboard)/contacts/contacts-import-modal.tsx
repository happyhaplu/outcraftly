'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Upload } from 'lucide-react';
import useSWR, { useSWRConfig } from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import { parseCsv } from '@/lib/contacts/csv';
import { cn } from '@/lib/utils';

import type {
  CustomFieldDef,
  ImportOptions,
  ImportResponseSummary,
  ImportRow,
  MappingTarget,
  SystemField
} from '@/types/shared';

type Step = 0 | 1 | 2;

const STEP_KEYS = ['upload', 'mapping', 'review'] as const;
type StepKey = (typeof STEP_KEYS)[number];

const SYSTEM_FIELD_KEYS: SystemField[] = ['firstName', 'lastName', 'email', 'company', 'jobTitle', 'tags'];

type PendingCustomFieldDefinition = {
  name: string;
  type: CustomFieldDef['type'];
};

type MappingState = Record<string, MappingTarget | undefined>;

const CUSTOM_FIELD_TYPES: CustomFieldDef['type'][] = ['text', 'number', 'date'];
const CSV_PREVIEW_LIMIT = 5;

const SYSTEM_FIELD_OPTIONS: Array<{ key: SystemField; label: string }> = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'tags', label: 'Tags' }
];

function slugifyPendingFieldName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'field'
  );
}

async function fetchCustomFields(url: string): Promise<CustomFieldDef[]> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Failed to load custom fields');
  }

  const payload = (await response.json()) as { data?: unknown };
  if (!payload.data || !Array.isArray(payload.data)) {
    return [];
  }

  const raw = payload.data as Array<{
    id: string;
    name: string;
    key: string;
    type: string;
    createdAt?: string;
  }>;

  return raw.map((field) => {
    const type = field.type === 'number' || field.type === 'date' ? field.type : 'text';
    return {
      id: field.id,
      name: field.name,
      key: field.key,
      type,
      createdAt: field.createdAt
    } satisfies CustomFieldDef;
  });
}

function mappingTargetsEqual(a: MappingTarget | undefined, b: MappingTarget | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'system' && b.kind === 'system') {
    return a.field === b.field;
  }
  if (a.kind === 'custom' && b.kind === 'custom') {
    return a.fieldKey === b.fieldKey;
  }
  return true;
}

function formatSystemValue(row: ImportRow, key: SystemField): string {
  if (key === 'tags') {
    return row.tags?.join(', ') ?? '';
  }

  const value = row[key];
  return typeof value === 'string' ? value : value ?? '';
}

function extractTags(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function ContactsImportModal({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { mutate: mutateCache } = useSWRConfig();

  const {
    data: customFields,
    error: customFieldsError,
    isLoading: customFieldsLoading,
    mutate: mutateCustomFields
  } = useSWR(open ? '/api/contacts/custom-fields' : null, fetchCustomFields);

  const [step, setStep] = useState<Step>(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(() => `${Date.now()}`);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<MappingState>({});
  const [pendingCustomFields, setPendingCustomFields] = useState<Record<string, PendingCustomFieldDefinition>>({});
  const [creatingFieldForColumn, setCreatingFieldForColumn] = useState<string | null>(null);
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCustomFieldType, setNewCustomFieldType] = useState<CustomFieldDef['type']>('text');
  const [importSummary, setImportSummary] = useState<ImportResponseSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleClearUpload = useCallback(() => {
    setRecords([]);
    setColumns([]);
    setMapping(() => ({}));
    setPendingCustomFields(() => ({}));
    setCreatingFieldForColumn(null);
    setNewCustomFieldName('');
    setNewCustomFieldType('text');
    setFileName(null);
    setUploadError(null);
    setImportSummary(null);
    setIsImporting(false);
    setFileInputKey(`${Date.now()}`);
    setStep(0);
  }, []);

  useEffect(() => {
    if (!open) {
      handleClearUpload();
    }
  }, [open, handleClearUpload]);

  const allCustomFieldMap = useMemo(() => {
    const map = new Map<string, CustomFieldDef>();
    for (const field of customFields ?? []) {
      map.set(field.key, field);
    }
    return map;
  }, [customFields]);

  const customFieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const field of customFields ?? []) {
      map.set(field.key, field.name);
    }
    for (const [key, meta] of Object.entries(pendingCustomFields)) {
      map.set(key, meta.name);
    }
    return map;
  }, [customFields, pendingCustomFields]);

  const customFieldOptions = useMemo(
    () => [
      ...(customFields ?? []).map((field) => ({
        label: field.name,
        value: field.key
      })),
      ...Object.entries(pendingCustomFields).map(([key, meta]) => ({
        label: `${meta.name} (new)`,
        value: key
      }))
    ],
    [customFields, pendingCustomFields]
  );

  const stagedCustomFieldEntries = useMemo(
    () =>
      Object.entries(pendingCustomFields).map(([key, meta]) => ({
        key,
        name: meta.name,
        type: meta.type
      })),
    [pendingCustomFields]
  );

  const sampleCsvRows = useMemo(() => records.slice(0, CSV_PREVIEW_LIMIT), [records]);

  const mappedColumns = useMemo(
    () =>
      columns.filter((column) => {
        const target = mapping[column];
        return target && target.kind !== 'ignore';
      }),
    [columns, mapping]
  );

  const mappedCustomFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const column of columns) {
      const target = mapping[column];
      if (target?.kind === 'custom') {
        keys.add(target.fieldKey);
      }
    }
    return Array.from(keys);
  }, [columns, mapping]);

  const unmappedColumns = useMemo(
    () => columns.filter((column) => !mapping[column]),
    [columns, mapping]
  );

  const totalRows = records.length;
  const allColumnsMapped = columns.length > 0 && unmappedColumns.length === 0;
  const hasRows = totalRows > 0;
  const hasMappedFields = mappedColumns.length > 0;
  const hasEmailMapping = useMemo(
    () =>
      columns.some((column) => {
        const target = mapping[column];
        return target?.kind === 'system' && target.field === 'email';
      }),
    [columns, mapping]
  );

  const transformedRows = useMemo<ImportRow[]>(() => {
    if (records.length === 0) {
      return [];
    }

    return records.map((record) => {
      const customFields: Record<string, string> = {};
      const row: ImportRow = {
        customFields,
        _raw: record
      };

      for (const column of columns) {
        const target = mapping[column];
        if (!target || target.kind === 'ignore') {
          continue;
        }

        const rawValue = record[column] ?? '';
        const value = typeof rawValue === 'string' ? rawValue : rawValue != null ? String(rawValue) : '';

        if (target.kind === 'system') {
          if (target.field === 'tags') {
            const tags = extractTags(value);
            if (tags.length > 0) {
              row.tags = tags;
            }
          } else if (value.length > 0) {
            row[target.field] = value;
          }
        } else if (target.kind === 'custom' && value.length > 0) {
          customFields[target.fieldKey] = value;
        }
      }

      return row;
    });
  }, [columns, mapping, records]);

  const previewRows = useMemo(() => transformedRows.slice(0, CSV_PREVIEW_LIMIT), [transformedRows]);

  const duplicateEmailSet = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const row of transformedRows) {
      const email = row.email?.trim().toLowerCase();
      if (!email) {
        continue;
      }

      if (seen.has(email)) {
        duplicates.add(email);
      } else {
        seen.add(email);
      }
    }

    return duplicates;
  }, [transformedRows]);

  const duplicateEmailCount = duplicateEmailSet.size;
  const duplicateEmailsPreview = useMemo(
    () => Array.from(duplicateEmailSet).slice(0, 5),
    [duplicateEmailSet]
  );

  const summaryErrors = importSummary?.errors ?? [];
  const importDuplicates = importSummary?.duplicates ?? 0;

  const canGoToMapping = columns.length > 0;
  const canGoToReview = allColumnsMapped && hasMappedFields && hasEmailMapping;
  const currentStepKey = STEP_KEYS[step];
  const showUploadStep = step === 0;
  const showMappingStep = step === 1;
  const showReviewStep = step === 2;

  const importDisabled =
    isImporting || !hasRows || !hasMappedFields || !hasEmailMapping || !allColumnsMapped;

  useEffect(() => {
    if (step === 2 && !hasEmailMapping) {
      setStep(1);
    }
  }, [hasEmailMapping, step]);

  const handleStepperSelect = useCallback(
    (next: StepKey) => {
      const idx = STEP_KEYS.indexOf(next);
      if (idx === -1) {
        return;
      }

      if (idx === 1 && !canGoToMapping) {
        return;
      }

      if (idx === 2 && !canGoToReview) {
        return;
      }

      setStep(idx as Step);
    },
    [canGoToMapping, canGoToReview]
  );

  const handleNextFromUpload = useCallback(() => {
    if (!canGoToMapping) {
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[contacts-import] continue clicked', {
        from: 'upload',
        fileName,
        headers: columns.length,
        rows: records.length
      });
    }

    handleStepperSelect('mapping');
  }, [canGoToMapping, columns, fileName, handleStepperSelect, records]);

  const handleNextFromMapping = useCallback(() => {
    if (!canGoToReview) {
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[contacts-import] continue clicked', {
        from: 'mapping',
        to: 'review',
        mappedColumns: mappedColumns.length,
        hasEmailMapping,
        rows: totalRows
      });
    }

    handleStepperSelect('review');
  }, [canGoToReview, handleStepperSelect, hasEmailMapping, mappedColumns, totalRows]);

  const clearMappingForColumn = useCallback(
    (column: string) => {
      setMapping((prev) => {
        const existing = prev[column];
        if (!existing) {
          return prev;
        }

        const next: MappingState = { ...prev };
        delete next[column];

        if (existing.kind === 'custom') {
          setPendingCustomFields((pendingPrev) => {
            if (!pendingPrev[existing.fieldKey]) {
              return pendingPrev;
            }

            const stillUsed = Object.values(next).some(
              (target) => target?.kind === 'custom' && target.fieldKey === existing.fieldKey
            );

            if (stillUsed) {
              return pendingPrev;
            }

            const copy = { ...pendingPrev } as Record<string, PendingCustomFieldDefinition>;
            delete copy[existing.fieldKey];
            return copy;
          });
        }

        return next;
      });

      setImportSummary(null);
    },
    []
  );

  const handleMappingChange = useCallback(
    (column: string, value: string) => {
      if (value === '') {
        clearMappingForColumn(column);
        if (creatingFieldForColumn === column) {
          setCreatingFieldForColumn(null);
        }
        return;
      }

      if (value === '__create__') {
        clearMappingForColumn(column);
        setCreatingFieldForColumn(column);
        setNewCustomFieldName('');
        setNewCustomFieldType('text');
        return;
      }

      let nextTarget: MappingTarget | undefined;

      if (value === 'ignore') {
        nextTarget = { kind: 'ignore' };
      } else if (value.startsWith('system:')) {
        const field = value.slice('system:'.length) as SystemField;
        if (SYSTEM_FIELD_KEYS.includes(field)) {
          nextTarget = { kind: 'system', field };
        }
      } else if (value.startsWith('custom:')) {
        const fieldKey = value.slice('custom:'.length);
        const meta = allCustomFieldMap.get(fieldKey) ?? pendingCustomFields[fieldKey];
        const fieldName =
          meta && 'name' in meta ? meta.name : customFieldLabelMap.get(fieldKey) ?? fieldKey;
        nextTarget = {
          kind: 'custom',
          fieldKey,
          fieldName
        };
      }

      if (!nextTarget) {
        clearMappingForColumn(column);
        return;
      }

      setMapping((prev) => {
        const previousTarget = prev[column];
        let changed = false;
        const next: MappingState = { ...prev };

        if (nextTarget && nextTarget.kind !== 'ignore') {
          for (const [otherColumn, otherTarget] of Object.entries(next)) {
            if (otherColumn === column) {
              continue;
            }
            if (mappingTargetsEqual(otherTarget, nextTarget)) {
              delete next[otherColumn];
              changed = true;
            }
          }
        }

        if (!mappingTargetsEqual(previousTarget, nextTarget)) {
          next[column] = nextTarget;
          changed = true;
        }

        if (!changed) {
          return prev;
        }

        setPendingCustomFields((pendingPrev) => {
          if (previousTarget?.kind === 'custom' && pendingPrev[previousTarget.fieldKey]) {
            const stillUsed = Object.values(next).some(
              (target) => target?.kind === 'custom' && target.fieldKey === previousTarget.fieldKey
            );
            if (!stillUsed) {
              const copy = { ...pendingPrev } as Record<string, PendingCustomFieldDefinition>;
              delete copy[previousTarget.fieldKey];
              return copy;
            }
          }
          return pendingPrev;
        });

        return next;
      });

      setImportSummary(null);
      setCreatingFieldForColumn(null);
    },
    [
      allCustomFieldMap,
      clearMappingForColumn,
      creatingFieldForColumn,
      customFieldLabelMap,
      pendingCustomFields
    ]
  );

  const handleResetMapping = useCallback(() => {
    setMapping(() => ({}));
    setPendingCustomFields(() => ({}));
    setCreatingFieldForColumn(null);
    setNewCustomFieldName('');
    setNewCustomFieldType('text');
    setImportSummary(null);
  }, []);

  const handleCreateCustomFieldForColumn = useCallback(
    (column: string) => {
      const trimmedName = newCustomFieldName.trim();
      if (trimmedName.length === 0) {
        toast({
          title: 'Name required',
          description: 'Enter a name for the new custom field.',
          variant: 'destructive'
        });
        return;
      }

      const normalizedName = trimmedName.toLowerCase();
      const existingField = (customFields ?? []).find(
        (field) => field.name.trim().toLowerCase() === normalizedName
      );

      if (existingField) {
        setMapping((prev) => ({
          ...prev,
          [column]: {
            kind: 'custom',
            fieldName: existingField.name,
            fieldKey: existingField.key
          }
        }));
        setImportSummary(null);
        setCreatingFieldForColumn(null);
        setNewCustomFieldName('');
        setNewCustomFieldType('text');

        toast({
          title: 'Custom field exists',
          description: `${existingField.name} already exists and has been selected.`
        });
        return;
      }

      const existingKeys = new Set<string>();
      for (const field of customFields ?? []) {
        existingKeys.add(field.key);
      }
      for (const key of Object.keys(pendingCustomFields)) {
        existingKeys.add(key);
      }

      const baseKey = slugifyPendingFieldName(trimmedName);
      let finalKey = baseKey;
      let suffix = 2;
      while (existingKeys.has(finalKey)) {
        finalKey = `${baseKey}-${suffix}`;
        suffix += 1;
      }

      setPendingCustomFields((prev) => ({
        ...prev,
        [finalKey]: { name: trimmedName, type: newCustomFieldType }
      }));

      setMapping((prev) => ({
        ...prev,
        [column]: {
          kind: 'custom',
          fieldName: trimmedName,
          fieldKey: finalKey
        }
      }));

      setImportSummary(null);
      setCreatingFieldForColumn(null);
      setNewCustomFieldName('');
      setNewCustomFieldType('text');

      toast({
        title: 'Custom field staged',
        description: `${trimmedName} will be created during import.`
      });
    },
    [customFields, newCustomFieldName, newCustomFieldType, pendingCustomFields, toast]
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setUploadError(null);
      setImportSummary(null);
      setCreatingFieldForColumn(null);
      setNewCustomFieldName('');
      setNewCustomFieldType('text');

      const reader = new FileReader();

      reader.onload = () => {
        let text = '';
        if (typeof reader.result === 'string') {
          text = reader.result;
        } else if (reader.result instanceof ArrayBuffer) {
          text = new TextDecoder().decode(reader.result);
        }

        try {
          const parsed = parseCsv(text);
          const headerKeys = parsed[0] ? Object.keys(parsed[0]) : [];

          if (parsed.length === 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[contacts-import] parsed CSV', {
                fileName: file.name,
                headers: 0,
                rows: 0,
                sampleRows: 0
              });
            }
            setRecords([]);
            setColumns([]);
            setMapping(() => ({}));
            setPendingCustomFields(() => ({}));
            setFileName(null);
            setUploadError('The CSV file does not contain any data rows.');
            setStep(0);
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('[contacts-import] parsed CSV', {
                fileName: file.name,
                headers: headerKeys.length,
                rows: parsed.length,
                sampleRows: Math.min(parsed.length, CSV_PREVIEW_LIMIT)
              });
            }
            setRecords(parsed);
            setColumns(headerKeys);
            setMapping(() => ({}));
            setPendingCustomFields(() => ({}));
            setFileName(file.name);
            setStep(1);
          }
        } catch (error) {
          setRecords([]);
          setColumns([]);
          setMapping(() => ({}));
          setPendingCustomFields(() => ({}));
          setFileName(null);
          setUploadError(error instanceof Error ? error.message : 'Failed to parse CSV file.');
          setStep(0);
        }
      };

      reader.onerror = () => {
        setRecords([]);
        setColumns([]);
        setMapping(() => ({}));
        setPendingCustomFields(() => ({}));
        setFileName(null);
        setUploadError('Failed to read file. Please try again.');
        setStep(0);
      };

      reader.readAsText(file);
      event.target.value = '';
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!allColumnsMapped) {
      toast({
        title: 'Finish mapping',
        description: 'Map every column or mark it as ignored before importing.',
        variant: 'destructive'
      });
      return;
    }

    if (!hasEmailMapping) {
      toast({
        title: 'Map email before importing',
        description: 'Assign a column to Email in the mapping step to enable deduplication.',
        variant: 'destructive'
      });
      setStep(1);
      return;
    }

    if (!hasMappedFields) {
      toast({
        title: 'Map at least one column',
        description: 'Choose a destination for at least one CSV column before importing.',
        variant: 'destructive'
      });
      setStep(1);
      return;
    }

    if (transformedRows.length === 0) {
      toast({
        title: 'Nothing to import',
        description: 'Upload a CSV file with data before importing.',
        variant: 'destructive'
      });
      setStep(0);
      return;
    }

    setImportSummary(null);
    setIsImporting(true);
    try {
      const pendingKeysInUse = new Set<string>();
      for (const column of columns) {
        const target = mapping[column];
        if (target?.kind !== 'custom') {
          continue;
        }
        if (pendingCustomFields[target.fieldKey]) {
          pendingKeysInUse.add(target.fieldKey);
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[contacts-import] import triggered', {
          rows: transformedRows.length,
          mappedColumns: mappedColumns.length,
          hasEmailMapping,
          pendingCustomFieldCount: pendingKeysInUse.size
        });
      }

      const customFieldMetadata = pendingKeysInUse.size
        ? Array.from(pendingKeysInUse).map((key) => ({
            name: pendingCustomFields[key].name,
            key,
            type: pendingCustomFields[key].type
          }))
        : undefined;

      const options: ImportOptions = {
        dedupeBy: hasEmailMapping ? 'email' : 'none'
      };

      if (customFieldMetadata?.length) {
        options.createMissingCustomFields = true;
        options.customFieldMetadata = customFieldMetadata;
      }

      const requestBody = {
        rows: transformedRows,
        options
      };

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: 'Import failed',
          description: typeof payload.error === 'string' ? payload.error : 'Unable to import contacts.',
          variant: 'destructive'
        });
        return;
      }

      const summary: ImportResponseSummary | null = payload?.summary ?? null;

      setImportSummary(summary);

      const createdFields = summary?.createdCustomFields ?? [];

      if (createdFields.length > 0) {
        setMapping((prev) => {
          const next: MappingState = { ...prev };
          let changed = false;

          for (const [pendingKey, meta] of Object.entries(pendingCustomFields)) {
            const created =
              createdFields.find((field: CustomFieldDef) => field.key === pendingKey) ??
              createdFields.find(
                (field: CustomFieldDef) =>
                  field.name.trim().toLowerCase() === meta.name.trim().toLowerCase()
              );

            if (!created) {
              continue;
            }

            for (const column of Object.keys(next)) {
              const target = next[column];
              if (target?.kind === 'custom' && target.fieldKey === pendingKey) {
                next[column] = {
                  kind: 'custom',
                  fieldName: created.name,
                  fieldKey: created.key
                };
                changed = true;
              }
            }
          }

          return changed ? next : prev;
        });

        setPendingCustomFields((prev) => {
          const next = { ...prev } as Record<string, PendingCustomFieldDefinition>;
          let changed = false;
          for (const field of createdFields) {
            if (next[field.key]) {
              delete next[field.key];
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        try {
          await mutateCustomFields();
        } catch (error) {
          console.error('Failed to refresh custom fields after import', error);
        }
      }

      const importedCount = summary?.imported ?? 0;
      const createdCount = summary?.created ?? 0;
      const updatedCount = summary?.updated ?? 0;
      const skippedCount = summary?.skipped ?? 0;

      const contactSentence = `Imported ${importedCount} contact${importedCount === 1 ? '' : 's'} (${createdCount} new, ${updatedCount} updated).`;
      const skippedSentence = skippedCount > 0 ? ` Skipped ${skippedCount}.` : '';
      const customFieldSentence = createdFields.length
        ? ` Created ${createdFields.length} custom field${createdFields.length === 1 ? '' : 's'}.`
        : '';

      toast({
        title: 'Import complete',
        description: `${contactSentence}${skippedSentence}${customFieldSentence}`.trim()
      });

      try {
        await mutateCache((key) => typeof key === 'string' && key.startsWith('/api/contacts'));
      } catch (error) {
        console.error('Failed to refresh contacts after import', error);
      }
    } finally {
      setIsImporting(false);
    }
  }, [
    allColumnsMapped,
    columns,
    hasEmailMapping,
    hasMappedFields,
    mappedColumns,
    mapping,
    mutateCache,
    mutateCustomFields,
    pendingCustomFields,
    toast,
    transformedRows
  ]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const renderMappingCell = (column: string) => {
    const target = mapping[column];
    const isCreating = creatingFieldForColumn === column;
    const isMapped = Boolean(target);

    let selectValue = '';
    let label: string | null = null;
    let badgeVariant: 'secondary' | 'outline' = 'secondary';

    if (target?.kind === 'system') {
      selectValue = `system:${target.field}`;
      label = SYSTEM_FIELD_OPTIONS.find((option) => option.key === target.field)?.label ?? target.field;
    } else if (target?.kind === 'custom') {
      selectValue = `custom:${target.fieldKey}`;
      label = customFieldLabelMap.get(target.fieldKey) ?? target.fieldName;
      badgeVariant = pendingCustomFields[target.fieldKey] ? 'outline' : 'secondary';
    } else if (target?.kind === 'ignore') {
      selectValue = 'ignore';
      label = 'Ignored';
      badgeVariant = 'outline';
    }

    return (
      <td key={column} className="align-top border border-border/40 px-3 py-2">
        <div className="space-y-2">
          <div
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-xs sm:text-sm',
              isMapped
                ? 'border border-border/60 bg-background'
                : 'border-2 border-dashed border-destructive/60 bg-destructive/10'
            )}
          >
            {isMapped && label ? (
              <>
                <Badge variant={badgeVariant} className="truncate text-[11px] uppercase tracking-wide">
                  {label}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => clearMappingForColumn(column)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-xs font-medium text-destructive">Drag field here</span>
            )}
          </div>

          <select
            value={selectValue}
            onChange={(event) => handleMappingChange(column, event.target.value)}
            className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs shadow-sm sm:text-sm"
          >
            <option value="">Select destination</option>
            <optgroup label="System fields">
              {SYSTEM_FIELD_OPTIONS.map((option) => (
                <option key={option.key} value={`system:${option.key}`}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            {customFieldOptions.length > 0 ? (
              <optgroup label="Custom fields">
                {customFieldOptions.map((option) => (
                  <option key={option.value} value={`custom:${option.value}`}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <option value="ignore">Ignore column</option>
            <option value="__create__">Create new custom field...</option>
          </select>

          {isCreating ? (
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`new-field-name-${column}`} className="text-xs font-medium">
                    New field name
                  </Label>
                  <Input
                    id={`new-field-name-${column}`}
                    value={newCustomFieldName}
                    onChange={(event) => setNewCustomFieldName(event.target.value)}
                    placeholder="e.g. Marketing source"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`new-field-type-${column}`} className="text-xs font-medium">
                    Type
                  </Label>
                  <select
                    id={`new-field-type-${column}`}
                    value={newCustomFieldType}
                    onChange={(event) => setNewCustomFieldType(event.target.value as CustomFieldDef['type'])}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm shadow-sm"
                  >
                    {CUSTOM_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleCreateCustomFieldForColumn(column)} className="min-w-[120px]">
                  Create field
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreatingFieldForColumn(null);
                    setNewCustomFieldName('');
                    setNewCustomFieldType('text');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </td>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>Upload a CSV file to import or update your contacts in bulk.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-muted/10 p-1 text-sm sm:grid-cols-3">
            {STEP_KEYS.map((key, idx) => {
              const label = key === 'upload' ? 'Upload' : key === 'mapping' ? 'Mapping' : 'Review';
              const description = idx === 0 ? 'Upload CSV' : idx === 1 ? 'Map columns' : 'Check & import';
              const isActive = currentStepKey === key;
              const isComplete = step > idx;
              const isDisabled =
                (key === 'mapping' && !canGoToMapping) || (key === 'review' && !canGoToReview);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleStepperSelect(key)}
                  disabled={isDisabled}
                  className={cn(
                    'rounded-md px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : isComplete
                      ? 'bg-background/40 text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{description}</div>
                </button>
              );
            })}
          </div>

          {showUploadStep ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-muted/10 p-8 text-center">
                <input
                  key={fileInputKey}
                  id="contacts-import-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="contacts-import-file" className="flex w-full cursor-pointer flex-col items-center gap-3">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {fileName ?? 'Click to upload CSV file'}
                  </span>
                  <span className="text-xs text-muted-foreground">or drag and drop your file here</span>
                </label>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="mt-[2px] h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  Use a CSV with headers in the first row. Recommended columns: First name, Last name, Email, Company, Job title, Tags.
                </span>
              </div>

              {fileName ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-foreground">{fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {records.length} row{records.length === 1 ? '' : 's'} detected  -  {columns.length} column{columns.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleClearUpload}>
                    Clear
                  </Button>
                </div>
              ) : null}

              {uploadError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {uploadError}
                </div>
              ) : null}
            </div>
          ) : null}

          {showMappingStep ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Map CSV columns</h3>
                  <p className="text-xs text-muted-foreground">
                    Assign each column to a system field, custom field, or mark it as ignored.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleResetMapping}>
                  Reset mapping
                </Button>
              </div>

              {columns.length === 0 ? (
                <p className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                  No columns detected. Upload a CSV file in the first step.
                </p>
              ) : (
                <div className="space-y-3">
                  {unmappedColumns.length > 0 ? (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Map the remaining {unmappedColumns.length} column{unmappedColumns.length === 1 ? '' : 's'} to continue.
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                    <table className="mapping-grid w-full table-fixed border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr>
                          {columns.map((column) => {
                            const isMapped = Boolean(mapping[column]);
                            return (
                              <th
                                key={column}
                                className={cn(
                                  'border border-border/40 bg-muted/40 px-3 py-2 text-left font-semibold text-foreground',
                                  isMapped ? '' : 'text-destructive'
                                )}
                              >
                                {column}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-muted/10">{columns.map((column) => renderMappingCell(column))}</tr>
                        {sampleCsvRows.length > 0 ? (
                          sampleCsvRows.map((row, rowIndex) => (
                            <tr key={`sample-${rowIndex}`} className="bg-background">
                              {columns.map((column) => {
                                const rawValue = row[column];
                                const displayValue =
                                  typeof rawValue === 'string'
                                    ? rawValue
                                    : rawValue !== null && rawValue !== undefined
                                    ? String(rawValue)
                                    : '';
                                return (
                                  <td key={`${rowIndex}-${column}`} className="border border-border/40 px-3 py-2 text-xs text-muted-foreground">
                                    {displayValue || '--'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={columns.length} className="border border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
                              No sample rows available in this CSV.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Showing the first {Math.min(sampleCsvRows.length, CSV_PREVIEW_LIMIT)} row{sampleCsvRows.length === 1 ? '' : 's'} from the uploaded CSV.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {showReviewStep ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Review &amp; import</h3>
                <p className="text-xs text-muted-foreground">Confirm the mapping and sample data before importing.</p>
              </div>

              <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/10 p-4 text-center sm:grid-cols-3">
                <div>
                  <div className="text-2xl font-semibold text-primary">{totalRows}</div>
                  <div className="text-xs text-muted-foreground">Total rows</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{mappedColumns.length}</div>
                  <div className="text-xs text-muted-foreground">Mapped columns</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-destructive">{duplicateEmailCount}</div>
                  <div className="text-xs text-muted-foreground">Potential duplicates</div>
                </div>
              </div>

              {!hasEmailMapping || !hasMappedFields || !hasRows ? (
                <div className="space-y-2">
                  {!hasEmailMapping ? (
                    <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <span>Email is not mapped. Map a column to Email to deduplicate contacts.</span>
                      <Button variant="link" size="sm" className="px-0 text-destructive underline" onClick={() => setStep(1)}>
                        Fix mapping
                      </Button>
                    </div>
                  ) : null}
                  {!hasMappedFields ? (
                    <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <span>Map at least one column before importing.</span>
                      <Button variant="link" size="sm" className="px-0 text-destructive underline" onClick={() => setStep(1)}>
                        Map columns
                      </Button>
                    </div>
                  ) : null}
                  {!hasRows ? (
                    <div className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Upload a CSV file with at least one data row to import.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {duplicateEmailsPreview.length > 0 ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-background px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duplicate emails detected</div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {duplicateEmailsPreview.map((email) => (
                      <li key={email} className="truncate">- {email}</li>
                    ))}
                  </ul>
                  {duplicateEmailCount > duplicateEmailsPreview.length ? (
                    <p className="text-[11px] text-muted-foreground">
                      +{duplicateEmailCount - duplicateEmailsPreview.length} more duplicate{duplicateEmailCount - duplicateEmailsPreview.length === 1 ? '' : 's'}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {stagedCustomFieldEntries.length > 0 ? (
                <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-3 text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">New custom fields</div>
                  <ul className="space-y-1">
                    {stagedCustomFieldEntries.map((field) => (
                      <li key={field.key} className="flex items-center justify-between gap-2">
                        <span className="text-foreground">{field.name}</span>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{field.type.toUpperCase()}</span>
                      </li>
                    ))}
                  </ul>
                  <p>These fields will be created and populated during import.</p>
                </div>
              ) : null}

              {customFieldsLoading ? (
                <p className="text-xs text-muted-foreground">Loading custom fields...</p>
              ) : customFieldsError ? (
                <p className="text-xs text-destructive">
                  Unable to load custom fields. You can still import; unmatched custom field mappings will be ignored.
                </p>
              ) : null}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Preview</h4>
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr>
                        {SYSTEM_FIELD_OPTIONS.map((field) => (
                          <th key={field.key} className="border border-border/40 bg-muted/40 px-3 py-2 text-left font-medium text-foreground">
                            {field.label}
                          </th>
                        ))}
                        {mappedCustomFieldKeys.map((key) => (
                          <th key={key} className="border border-border/40 bg-muted/40 px-3 py-2 text-left font-medium text-foreground">
                            {customFieldLabelMap.get(key) ?? key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length > 0 ? (
                        previewRows.map((row, rowIndex) => {
                          const emailKey = row.email?.toLowerCase() ?? '';
                          const isDuplicate = emailKey ? duplicateEmailSet.has(emailKey) : false;
                          return (
                            <tr key={`preview-${rowIndex}`} className={cn('bg-background', isDuplicate ? 'bg-destructive/10 text-destructive' : '')}>
                              {SYSTEM_FIELD_OPTIONS.map((field) => (
                                <td key={`${rowIndex}-${field.key}`} className="border border-border/40 px-3 py-2 text-xs">
                                  {formatSystemValue(row, field.key) || '--'}
                                </td>
                              ))}
                              {mappedCustomFieldKeys.map((key) => (
                                <td key={`${rowIndex}-${key}`} className="border border-border/40 px-3 py-2 text-xs">
                                  {row.customFields?.[key] ?? '--'}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={SYSTEM_FIELD_OPTIONS.length + mappedCustomFieldKeys.length}
                            className="border border-border/40 px-3 py-6 text-center text-xs text-muted-foreground"
                          >
                            Preview unavailable. Upload a CSV file to see sample data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {importSummary ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">Last import summary</div>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    <div>
                      Created: <span className="font-medium text-foreground">{importSummary.created}</span>
                    </div>
                    <div>
                      Updated: <span className="font-medium text-foreground">{importSummary.updated}</span>
                    </div>
                    <div>
                      Skipped: <span className="font-medium text-foreground">{importSummary.skipped}</span>
                    </div>
                    <div>
                      Duplicates: <span className="font-medium text-foreground">{importDuplicates}</span>
                    </div>
                    <div>
                      Total processed: <span className="font-medium text-foreground">{importSummary.total}</span>
                    </div>
                  </div>
                  {summaryErrors.length > 0 ? (
                    <div className="space-y-1">
                      <div className="font-medium text-destructive">Errors</div>
                      <ul className="list-disc space-y-1 pl-5">
                        {summaryErrors.slice(0, 5).map((error) => (
                          <li key={`${error.rowIndex}-${error.message}`} className="text-xs text-destructive">
                            Row {error.rowIndex + 1}: {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 pt-4">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={handleClose} className="sm:min-w-[120px]">
                Cancel
              </Button>
              {step > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() => setStep((prev) => (prev > 0 ? ((prev - 1) as Step) : prev))}
                  className="sm:min-w-[120px]"
                >
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              {step === 0 ? (
                <Button onClick={handleNextFromUpload} disabled={!canGoToMapping} className="sm:min-w-[160px]">
                  Next: Mapping
                </Button>
              ) : step === 1 ? (
                <Button onClick={handleNextFromMapping} disabled={!canGoToReview} className="sm:min-w-[160px]">
                  Next: Review
                </Button>
              ) : (
                <Button onClick={handleImport} disabled={importDisabled} className="sm:min-w-[160px]">
                  {isImporting ? 'Importing...' : 'Import contacts'}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
