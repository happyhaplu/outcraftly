'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ContactUpload } from './contact-upload';
import { ContactFormModal } from './contact-form-modal';
import type { UploadSummary } from './types';

type ContactActionsProps = {
  disabled?: boolean;
};

export function ContactActions({ disabled = false }: ContactActionsProps) {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const { toast } = useToast();

  const handleCreateSuccess = (message: string) => {
    toast({
      title: 'Contact created',
      description: message
    });
  };

  const handleUploadSuccess = (summary: UploadSummary) => {
    toast({
      title: 'Contacts uploaded successfully',
      description: `${summary.inserted} added, ${summary.duplicates} skipped as duplicates`
    });
    setImportOpen(false);
  };

  const handleUploadError = (message: string) => {
    toast({
      title: 'Upload failed',
      description: message,
      variant: 'destructive'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setCreateOpen(true)} disabled={disabled}>
          Create contact
        </Button>
        <Button
          variant="outline"
          onClick={() => setImportOpen(true)}
          disabled={disabled}
        >
          Import contacts
        </Button>
      </div>

      <ContactFormModal
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />

      <Dialog open={isImportOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Import contacts</DialogTitle>
            <DialogDescription>
              Upload a CSV file to add multiple contacts at once.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <ContactUpload
              onSuccess={handleUploadSuccess}
              onError={handleUploadError}
              onFinished={() => setImportOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
