export type ContactListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  tags: string[];
  createdAt: string;
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
