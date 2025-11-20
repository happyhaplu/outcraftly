'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import type { KeyedMutator } from 'swr';

import { Button } from '@/components/ui/button';

import type { SenderListItem } from './types';

type VerifyButtonProps = {
  senderId: number;
  currentStatus: SenderListItem['status'];
  mutate: KeyedMutator<SenderListItem[]>;
};

export function VerifyButton({ senderId, currentStatus, mutate }: VerifyButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const isVerified = currentStatus === 'verified';
  const isDisabled = currentStatus === 'disabled';

  const handleVerify = async () => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/senders/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senderId })
      });

      const payload = await response.json();
      const nextStatus = payload?.sender?.status ?? (response.ok ? 'verified' : 'error');

      await mutate(
        (current = []) =>
          current.map((sender) =>
            sender.id === senderId ? { ...sender, status: nextStatus } : sender
          ),
        { revalidate: false }
      );

      if (response.ok) {
        setFeedback({ type: 'success', message: 'Connection verified successfully.' });
      } else {
        const reason = payload?.reason || payload?.error || 'SMTP connection failed.';
        setFeedback({ type: 'error', message: reason });
      }
    } catch (_error) {
      setFeedback({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setIsSubmitting(false);
      void mutate();
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleVerify}
        disabled={isSubmitting || isDisabled}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isVerified ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <ShieldAlert className="h-4 w-4" />
        )}
        {isSubmitting
          ? 'Verifying…'
          : isVerified
            ? 'Reverify'
            : isDisabled
              ? 'Enable to verify'
              : 'Verify connection'}
      </Button>
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
    </div>
  );
}
