'use client';

import { useState } from 'react';
import type { KeyedMutator } from 'swr';
import { ShieldOff, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { ConfirmModal } from './confirm-modal';
import type { SenderListItem } from './types';

type SenderActionsProps = {
  sender: SenderListItem;
  mutate: KeyedMutator<SenderListItem[]>;
};

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

export function SenderActions({ sender, mutate }: SenderActionsProps) {
  const [isDisableModalOpen, setDisableModalOpen] = useState(false);
  const [isRemoveModalOpen, setRemoveModalOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const handleDisable = async () => {
    setIsDisabling(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/senders/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senderId: sender.id })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to update sender status.');
      }

      const updated = payload.sender as SenderListItem;

      await mutate(
        (current = []) =>
          current.map((item) => (item.id === sender.id ? { ...item, ...updated } : item)),
        { revalidate: false }
      );

      setFeedback({
        type: 'success',
        message: updated.status === 'disabled' ? 'Sender disabled.' : 'Sender re-enabled.'
      });
      setDisableModalOpen(false);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unexpected error.' });
    } finally {
      setIsDisabling(false);
      void mutate();
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/senders/remove', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senderId: sender.id })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Unable to remove sender.');
      }

      await mutate(
        (current = []) => current.filter((item) => item.id !== sender.id),
        { revalidate: false }
      );

      setRemoveModalOpen(false);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unexpected error.' });
    } finally {
      setIsRemoving(false);
      void mutate();
    }
  };

  const isDisabled = sender.status === 'disabled';

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant={isDisabled ? 'secondary' : 'default'}
          size="sm"
          className="gap-2"
          onClick={() => setDisableModalOpen(true)}
        >
          <ShieldOff className="h-4 w-4" />
          {isDisabled ? 'Enable sender' : 'Disable sender'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => setRemoveModalOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Remove sender
        </Button>
      </div>

      {feedback && (
        <p
          className={`text-xs ${
            feedback.type === 'success' ? 'text-success' : 'text-destructive'
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      )}

      <ConfirmModal
        open={isDisableModalOpen}
        onOpenChange={(open) => {
          setDisableModalOpen(open);
          if (open) {
            setFeedback(null);
          }
        }}
        title={isDisabled ? 'Re-enable sender' : 'Disable sender'}
        description={
          isDisabled
            ? 'Are you sure you want to re-enable this sender? They will be able to send emails again.'
            : 'Are you sure you want to disable this sender? You can re-enable later.'
        }
        confirmLabel={isDisabled ? 'Enable sender' : 'Disable sender'}
        isLoading={isDisabling}
        onConfirm={handleDisable}
        confirmVariant={isDisabled ? 'default' : 'default'}
      />

      <ConfirmModal
        open={isRemoveModalOpen}
        onOpenChange={(open) => {
          setRemoveModalOpen(open);
          if (open) {
            setFeedback(null);
          }
        }}
        title="Remove sender"
        description="Are you sure you want to permanently remove this sender? This action cannot be undone."
        confirmLabel="Remove permanently"
        confirmVariant="destructive"
        isLoading={isRemoving}
        onConfirm={handleRemove}
      />
    </div>
  );
}
