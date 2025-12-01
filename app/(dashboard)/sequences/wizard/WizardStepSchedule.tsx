import { ChangeEvent, useMemo } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';

import type { SequenceScheduleMode, SequenceWizardSchedule } from '../types';

export type WizardStepScheduleProps = {
  schedule: SequenceWizardSchedule;
  onScheduleChange: (next: SequenceWizardSchedule) => void;
  timezoneSuggestion?: string | null;
};

const pad = (value: number) => value.toString().padStart(2, '0');

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney'
];

const getAvailableTimezones = () => {
  try {
    const intlWithSupport = Intl as typeof Intl & { supportedValuesOf?: (key: string) => readonly string[] };
    const supported = typeof intlWithSupport.supportedValuesOf === 'function'
      ? intlWithSupport.supportedValuesOf('timeZone')
      : null;
    if (supported && Array.isArray(supported) && supported.length > 0) {
      return supported as string[];
    }
  } catch (_error) {
    // ignore and fall back
  }
  return FALLBACK_TIMEZONES;
};

const toLocalInputValue = (iso: string | null) => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const fromLocalInputValue = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

export function WizardStepSchedule({
  schedule,
  onScheduleChange,
  timezoneSuggestion
}: WizardStepScheduleProps) {
  const { mode, sendTime, sendWindowStart, sendWindowEnd, respectContactTimezone, launchAt } = schedule;
  const timezone = schedule.timezone ?? null;
  const sendDays = schedule.sendDays ?? [];
  const sendWindows = schedule.sendWindows ?? [];

  const timezones = useMemo(() => getAvailableTimezones(), []);

  const daysOfWeek = useMemo(() => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], []);

  const windowsOverlap = (windows: Array<{ start: string; end: string }>) => {
    const sorted = windows
      .map((w) => ({ start: w.start, end: w.end }))
      .sort((a, b) => (a.start > b.start ? 1 : a.start < b.start ? -1 : 0));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (!sorted[i].start || !sorted[i].end || !sorted[i + 1].start) continue;
      if (sorted[i].end > sorted[i + 1].start) return true;
    }
    return false;
  };

  const updateSchedule = (patch: Partial<SequenceWizardSchedule>) => {
    onScheduleChange({ ...schedule, ...patch });
  };

  const switchMode = (nextMode: SequenceScheduleMode) => {
    if (nextMode === 'immediate') {
      updateSchedule({
        mode: nextMode,
        sendTime: null,
        sendWindowStart: null,
        sendWindowEnd: null
      });
      return;
    }
    if (nextMode === 'fixed') {
      updateSchedule({
        mode: nextMode,
        sendTime: sendTime ?? '09:00',
        sendWindowStart: null,
        sendWindowEnd: null
      });
      return;
    }
    updateSchedule({
      mode: nextMode,
      sendTime: null,
      sendWindowStart: sendWindowStart ?? '09:00',
      sendWindowEnd: sendWindowEnd ?? '17:00'
    });
  };

  const handleLaunchAtChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = fromLocalInputValue(event.target.value);
    updateSchedule({ launchAt: nextValue });
  };

  const toggleDay = (day: string) => {
    const next = new Set(sendDays);
    if (next.has(day)) next.delete(day); else next.add(day);
    updateSchedule({ sendDays: Array.from(next) });
  };

  const addWindow = () => {
    const next = [...sendWindows, { start: '09:00', end: '11:00' }];
    if (windowsOverlap(next)) return;
    updateSchedule({ sendWindows: next });
  };

  const updateWindow = (index: number, patch: { start?: string; end?: string }) => {
    const next = sendWindows.map((w, i) => (i === index ? { ...w, ...patch } : w));
    if (windowsOverlap(next)) return;
    updateSchedule({ sendWindows: next });
  };

  const removeWindow = (index: number) => {
    const next = sendWindows.filter((_, i) => i !== index);
    updateSchedule({ sendWindows: next });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Launch timing</Label>
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="radio"
              name="wizard-launch-mode"
              value="manual"
              checked={!launchAt}
              onChange={() => updateSchedule({ launchAt: null })}
              className="h-4 w-4"
            />
            Launch manually after review
          </label>
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="radio"
              name="wizard-launch-mode"
              value="scheduled"
              checked={Boolean(launchAt)}
              onChange={() => {
                if (!launchAt) {
                  const now = new Date();
                  now.setMinutes(now.getMinutes() + 30);
                  now.setSeconds(0, 0);
                  updateSchedule({ launchAt: now.toISOString() });
                }
              }}
              className="h-4 w-4"
            />
            Schedule automatic launch
          </label>
          <div className="md:col-span-2">
            <Input
              type="datetime-local"
              value={toLocalInputValue(launchAt)}
              onChange={handleLaunchAtChange}
              disabled={!launchAt}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {launchAt
                ? 'Pick the moment the sequence should switch from draft to active.'
                : 'You can launch from the review screen or the sequences list later.'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Contact scheduling</Label>
  <RadioGroup value={mode} onValueChange={(value) => switchMode(value as SequenceScheduleMode)} className="grid gap-3 md:grid-cols-3">
          <label
            htmlFor="wizard-schedule-immediate"
            className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm shadow-sm transition hover:border-primary/40"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="immediate" id="wizard-schedule-immediate" />
              <span className="font-semibold text-foreground">Default cadence</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Contacts start as soon as the worker runs. Step delays control the pacing.
            </span>
          </label>
          <label
            htmlFor="wizard-schedule-fixed"
            className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm shadow-sm transition hover:border-primary/40"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="fixed" id="wizard-schedule-fixed" />
              <span className="font-semibold text-foreground">Fixed time</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Pick a daily send time (per timezone) for first-touch emails.
            </span>
          </label>
          <label
            htmlFor="wizard-schedule-window"
            className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm shadow-sm transition hover:border-primary/40"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="window" id="wizard-schedule-window" />
              <span className="font-semibold text-foreground">Send window</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Define a daily window to randomise first-touch delivery.
            </span>
          </label>
        </RadioGroup>
      </div>

      {mode === 'fixed' ? (
        <div className="space-y-2">
          <Label htmlFor="wizard-schedule-send-time">Daily send time</Label>
          <Input
            id="wizard-schedule-send-time"
            type="time"
            value={sendTime ?? ''}
            onChange={(event) => updateSchedule({ sendTime: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Contacts will start step one around this time. We&apos;ll respect their timezone when available.
          </p>
        </div>
      ) : null}

      {mode === 'window' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wizard-window-start">Window start</Label>
            <Input
              id="wizard-window-start"
              type="time"
              value={sendWindowStart ?? ''}
              onChange={(event) => updateSchedule({ sendWindowStart: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-window-end">Window end</Label>
            <Input
              id="wizard-window-end"
              type="time"
              value={sendWindowEnd ?? ''}
              onChange={(event) => updateSchedule({ sendWindowEnd: event.target.value })}
            />
          </div>
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Contacts are evenly distributed across the window. We&apos;ll nudge to the next day if the window has already passed.
          </p>
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-border/60 bg-background px-5 py-4 shadow-sm">
        <label className="flex items-start gap-3" htmlFor="wizard-respect-timezone">
          <Checkbox
            id="wizard-respect-timezone"
            checked={respectContactTimezone}
            onCheckedChange={(checked) => updateSchedule({ respectContactTimezone: Boolean(checked) })}
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Respect each contact&apos;s timezone</p>
            <p className="text-xs text-muted-foreground">
              When disabled, everyone uses the fallback timezone below.
            </p>
          </div>
        </label>

        <div className="space-y-2">
          <Label htmlFor="wizard-timezone">Timezone</Label>
          <div className="flex gap-2">
            <Input
              id="wizard-timezone"
              list="tz-list"
              value={timezone ?? ''}
              placeholder={timezoneSuggestion ?? 'Select timezone'}
              onChange={(e) => updateSchedule({ timezone: e.target.value || null })}
            />
            <datalist id="tz-list">
              {timezones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </div>
          <p className="text-xs text-muted-foreground">Select the timezone for scheduling delivery windows.</p>

          <Label className="mt-3">Days to Send</Label>
          <div className="flex flex-wrap gap-2">
            {daysOfWeek.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={"rounded-full border px-3 py-1 text-xs " + (sendDays.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground')}
              >
                {d}
              </button>
            ))}
          </div>

          <Label className="mt-3">Send windows</Label>
          <div className="space-y-2">
            {sendWindows.map((w, idx) => (
              <div key={`${w.start}-${w.end}-${idx}`} className="flex items-center gap-2">
                <Input type="time" value={w.start} onChange={(e) => updateWindow(idx, { start: e.target.value })} />
                <span className="text-sm">—</span>
                <Input type="time" value={w.end} onChange={(e) => updateWindow(idx, { end: e.target.value })} />
                <Button type="button" variant="ghost" onClick={() => removeWindow(idx)}>Remove</Button>
              </div>
            ))}
            <div>
              <Button type="button" onClick={addWindow}>Add window</Button>
              {windowsOverlap(sendWindows) ? (
                <p className="text-xs text-destructive mt-1">Windows overlap — please adjust</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
