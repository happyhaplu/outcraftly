export interface CustomFieldDef {
  id?: string;
  name: string;
  key: string;
  type: 'text' | 'number' | 'date';
  createdAt?: string;
}

export type SystemField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'company'
  | 'jobTitle'
  | 'tags';

export type MappingTarget =
  | {
      kind: 'system';
      field: SystemField;
    }
  | {
      kind: 'custom';
      fieldName: string;
      fieldKey: string;
    }
  | {
      kind: 'ignore';
    };

export type Mapping = Record<string, MappingTarget>;

export interface ImportRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  tags?: string[];
  customFields?: Record<string, string>;
  _raw?: Record<string, string>;
}

export type CustomFieldMetadataDescriptor = {
  name: string;
  key?: string;
  type: CustomFieldDef['type'];
};

export interface ImportOptions {
  dedupeBy?: 'email' | 'none';
  createMissingCustomFields?: boolean;
  customFieldMetadata?:
    | CustomFieldMetadataDescriptor[]
    | Record<string, CustomFieldMetadataDescriptor>;
}

export interface ImportResponseSummary {
  total: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  createdCustomFields?: CustomFieldDef[];
  errors?: Array<{
    rowIndex: number;
    message: string;
  }>;
}
