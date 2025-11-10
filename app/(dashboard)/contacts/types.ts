export type ContactListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  tags: string[];
  createdAt: string;
  customFields?: Record<string, string | number | null>;
};

export type ContactCustomFieldDefinition = {
  id: string;
  name: string;
  key: string;
  type: 'text' | 'number' | 'date';
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactCustomFieldValueMap = Record<string, string | number | null>;

export type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  timezone: string | null;
  tags: string[];
  createdAt: string;
  customFields: ContactCustomFieldValueMap;
};

export type UploadSummary = {
  total: number;
  inserted: number;
  skipped: number;
  duplicates: number;
};

export type ParsedContactDraft = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  tags: string[];
};

export type FileDuplicateEntry = {
  email: string;
  occurrences: number;
};

export type UploadPreviewSummary = {
  fileName: string;
  totalRows: number;
  uniqueContacts: number;
  duplicatesDetected: number;
  duplicatesInFile: FileDuplicateEntry[];
  duplicatesInDatabase: string[];
};
