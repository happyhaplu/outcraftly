'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Loader2, Settings2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import { TokenDropdown } from './TokenDropdown';
import { BuilderStep } from './types';

const delayUnitOptions: Array<{ value: 'hours' | 'days'; label: string }> = [
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' }
];

type SequenceStepCardProps = {
  step: BuilderStep;
  index: number;
  totalSteps: number;
  sequenceId?: string | null;
  currentUserEmail?: string;
  onUpdate: (id: string, updates: Partial<BuilderStep>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  disableDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export function SequenceStepCard({
  step,
  index,
  totalSteps,
  sequenceId,
  currentUserEmail,
  onUpdate,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  disableDelete,
  canMoveUp,
  canMoveDown
}: SequenceStepCardProps) {
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(() =>
    Boolean(step.skipIfReplied) || Boolean(step.skipIfBounced) || typeof step.delayIfReplied === 'number'
  );
  const [isTestDialogOpen, setTestDialogOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const { toast } = useToast();

  const detectedTokens = useMemo(() => {
    const pattern = /\{\{([a-zA-Z0-9]+)\}\}/g;
    const matches = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(step.subject)) !== null) {
      matches.add(match[1]);
    }
    while ((match = pattern.exec(step.body)) !== null) {
      matches.add(match[1]);
    }
    return Array.from(matches.values());
  }, [step.subject, step.body]);

  const handleTokenInsert = (field: 'subject' | 'body', tokenText: string) => {
    const target = field === 'subject' ? subjectRef.current : bodyRef.current;
    const currentValue = field === 'subject' ? step.subject : step.body;

    if (!target) {
      onUpdate(step.internalId, field === 'subject' ? { subject: currentValue + tokenText } : { body: currentValue + tokenText });
      return;
    }

    const selectionStart = target.selectionStart ?? currentValue.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const nextValue = `${currentValue.slice(0, selectionStart)}${tokenText}${currentValue.slice(selectionEnd)}`;

    if (field === 'subject') {
      onUpdate(step.internalId, { subject: nextValue });
    } else {
      onUpdate(step.internalId, { body: nextValue });
    }

    requestAnimationFrame(() => {
      const cursor = selectionStart + tokenText.length;
      target.focus();
      target.setSelectionRange(cursor, cursor);
    });
  };

  const canSendTest = Boolean(sequenceId && step.backendId);

  const handleOpenTestDialog = () => {
    if (!canSendTest) {
      return;
    }
    setTestRecipient((currentUserEmail ?? '').trim());
    setTestError(null);
    setTestDialogOpen(true);
  };

  const handleSendTestEmail = async () => {
    if (!sequenceId || !step.backendId) {
      return;
    }

    const trimmed = testRecipient.trim();
    if (!trimmed) {
      setTestError('Enter an email address to send the test.');
      return;
    }

    setIsSendingTest(true);
    setTestError(null);

    try {
      const response = await fetch(`/api/sequences/${sequenceId}/steps/${step.backendId}/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: trimmed })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : 'Unable to send test email.';
        setTestError(message);
        toast({
          title: 'Test email failed',
          description: message,
          variant: 'destructive'
        });
        return;
      }

      setTestDialogOpen(false);
      toast({
        title: 'Test email sent',
        description: `Check ${trimmed} for a preview.`
      });
    } catch (error) {
      console.error('Failed to send test email', error);
      const message = 'Something went wrong. Please try again.';
      setTestError(message);
      toast({
        title: 'Test email failed',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleTestDialogChange = (open: boolean) => {
    if (!open) {
      if (isSendingTest) {
        return;
      }
      setTestDialogOpen(false);
      setTestError(null);
      return;
    }
    if (!isTestDialogOpen) {
      setTestRecipient((currentUserEmail ?? '').trim());
    }
    setTestDialogOpen(true);
  };

  return (
    <>
      <div className={cn('rounded-xl border border-border/60 bg-muted/30 p-5 shadow-sm transition-colors')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {index + 1}
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Step {index + 1}</p>
            <p className="text-sm text-muted-foreground">Email touchpoint</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleOpenTestDialog}
            disabled={!canSendTest}
            title={canSendTest ? undefined : 'Save this step to send a test email.'}
            className="h-9"
          >
            Send test
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onDuplicate(step.internalId)}
            aria-label="Duplicate step"
          >
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive"
            onClick={() => onDelete(step.internalId)}
            disabled={disableDelete}
            aria-label="Delete step"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onMoveUp(step.internalId)}
            disabled={!canMoveUp}
            aria-label="Move step up"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onMoveDown(step.internalId)}
            disabled={!canMoveDown}
            aria-label="Move step down"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`sequence-step-subject-${step.internalId}`}>Subject</Label>
            <TokenDropdown
              onInsert={(token) => handleTokenInsert('subject', token)}
              disabled={false}
              align="end"
            />
          </div>
          <Input
            ref={subjectRef}
            id={`sequence-step-subject-${step.internalId}`}
            value={step.subject}
            placeholder="e.g. Quick idea for {{company}}"
            onChange={(event) => onUpdate(step.internalId, { subject: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Email body</Label>
            <TokenDropdown onInsert={(token) => handleTokenInsert('body', token)} disabled={false} align="end" />
          </div>
          <Textarea
            ref={bodyRef}
            value={step.body}
            onChange={(event) => onUpdate(step.internalId, { body: event.target.value })}
            placeholder="Hi {{firstName}}, I noticed..."
          />
          {detectedTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Tokens used:</span>
              {detectedTokens.map((token) => (
                <span
                  key={`${step.internalId}-${token}`}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"
                >
                  {`{{${token}}}`}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="space-y-1">
            <Label htmlFor={`sequence-step-delay-${step.internalId}`}>Delay before sending</Label>
            <span className="text-xs text-muted-foreground">
              Wait time before the platform sends this step.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id={`sequence-step-delay-${step.internalId}`}
              type="number"
              min={0}
              value={Number.isNaN(step.delayValue) ? '' : step.delayValue}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                onUpdate(step.internalId, { delayValue: Number.isNaN(nextValue) ? 0 : nextValue });
              }}
              className="w-24"
            />
            <select
              value={step.delayUnit}
              onChange={(event) => onUpdate(step.internalId, { delayUnit: event.target.value as 'hours' | 'days' })}
              className="h-10 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {delayUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Advanced engagement options</p>
              <p className="text-xs text-muted-foreground">
                Adjust reply and bounce handling when you need more control.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced((previous) => !previous)}
              className="gap-2"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              {showAdvanced ? 'Hide options' : 'Show options'}
            </Button>
          </div>

          {showAdvanced ? (
            <div className="space-y-4 px-4 py-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`sequence-step-skip-replied-${step.internalId}`}
                  checked={Boolean(step.skipIfReplied)}
                  onCheckedChange={(checked) =>
                    onUpdate(step.internalId, {
                      skipIfReplied: Boolean(checked),
                      ...(checked ? { delayIfReplied: null } : {})
                    })
                  }
                  aria-describedby={`sequence-step-skip-replied-hint-${step.internalId}`}
                />
                <div className="space-y-1">
                  <label
                    htmlFor={`sequence-step-skip-replied-${step.internalId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Skip step when a contact replies
                  </label>
                  <p
                    id={`sequence-step-skip-replied-hint-${step.internalId}`}
                    className="text-xs text-muted-foreground"
                  >
                    Automatically stop future emails once we detect a reply.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id={`sequence-step-skip-bounced-${step.internalId}`}
                  checked={Boolean(step.skipIfBounced)}
                  onCheckedChange={(checked) =>
                    onUpdate(step.internalId, { skipIfBounced: Boolean(checked) })
                  }
                  aria-describedby={`sequence-step-skip-bounced-hint-${step.internalId}`}
                />
                <div className="space-y-1">
                  <label
                    htmlFor={`sequence-step-skip-bounced-${step.internalId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    Skip step when an email bounces
                  </label>
                  <p
                    id={`sequence-step-skip-bounced-hint-${step.internalId}`}
                    className="text-xs text-muted-foreground"
                  >
                    Prevents sending follow-ups to contacts with delivery issues.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="space-y-1">
                  <Label htmlFor={`sequence-step-delay-replied-${step.internalId}`}>Pause after a reply</Label>
                  <span className="text-xs text-muted-foreground">
                    Optional buffer before resuming if the contact responds.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id={`sequence-step-delay-replied-${step.internalId}`}
                    type="number"
                    min={0}
                    step={1}
                    value={
                      typeof step.delayIfReplied === 'number' && !Number.isNaN(step.delayIfReplied)
                        ? step.delayIfReplied
                        : ''
                    }
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (raw === '') {
                        onUpdate(step.internalId, { delayIfReplied: null });
                        return;
                      }
                      const numeric = Number(raw);
                      if (Number.isNaN(numeric)) {
                        onUpdate(step.internalId, { delayIfReplied: null });
                        return;
                      }
                      const coerced = Math.max(0, Math.round(numeric));
                      onUpdate(step.internalId, { delayIfReplied: coerced });
                    }}
                    disabled={Boolean(step.skipIfReplied)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Step {index + 1} of {totalSteps}. Use the move buttons to adjust ordering.
        </p>
      </div>

      <Dialog open={isTestDialogOpen} onOpenChange={handleTestDialogChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>Preview this step by emailing yourself or a teammate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`sequence-step-test-email-${step.internalId}`}>Recipient email</Label>
              <Input
                id={`sequence-step-test-email-${step.internalId}`}
                value={testRecipient}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(event) => {
                  setTestRecipient(event.target.value);
                  if (testError) {
                    setTestError(null);
                  }
                }}
              />
              {testError ? <p className="text-sm text-destructive">{testError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleTestDialogChange(false)}
              disabled={isSendingTest}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSendTestEmail} disabled={isSendingTest}>
              {isSendingTest ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Sending...
                </span>
              ) : (
                'Send test email'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
