'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ContactFormModal } from './contact-form-modal';
import { ContactCustomFieldsManager } from './contact-custom-fields-manager';
import { ContactsImportModal } from './contacts-import-modal';

type ContactActionsProps = {
  disabled?: boolean;
};

export function ContactActions({ disabled = false }: ContactActionsProps) {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const [isCustomFieldsOpen, setCustomFieldsOpen] = useState(false);
  const { toast } = useToast();

  const handleCreateSuccess = (message: string) => {
    toast({
      title: 'Contact created',
      description: message
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
        <Button
          variant="ghost"
          onClick={() => setCustomFieldsOpen(true)}
          disabled={disabled}
        >
          Manage custom fields
        </Button>
      </div>

      <ContactFormModal
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
      <ContactCustomFieldsManager open={isCustomFieldsOpen} onOpenChange={setCustomFieldsOpen} />
      <ContactsImportModal open={isImportOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
