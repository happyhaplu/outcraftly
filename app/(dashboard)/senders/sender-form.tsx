'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSWRConfig } from 'swr';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  senderFormSchema,
  type SenderFormValues
} from '@/lib/validation/sender';

export function SenderForm() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    control
  } = useForm<SenderFormValues>({
    resolver: zodResolver(senderFormSchema),
    defaultValues: {
      name: '',
      email: '',
      host: '',
      port: 587,
      smtpSecurity: 'SSL/TLS',
      username: '',
      password: '',
      inboundHost: '',
      inboundPort: 993,
      inboundSecurity: 'SSL/TLS',
      inboundProtocol: 'IMAP'
    }
  });

  const onSubmit = handleSubmit(async (values: SenderFormValues) => {
    setServerError(null);
    setServerSuccess(null);

    try {
      const requestPayload: SenderFormValues = {
        ...values,
        inboundHost: values.inboundHost?.trim() ? values.inboundHost.trim() : undefined,
        inboundPort:
          typeof values.inboundPort === 'number' && Number.isFinite(values.inboundPort)
            ? values.inboundPort
            : undefined,
        inboundSecurity: values.inboundSecurity ? values.inboundSecurity : undefined,
        inboundProtocol: values.inboundProtocol ? values.inboundProtocol : undefined
      };

      const response = await fetch('/api/senders/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.issues?.length) {
          setServerError(payload.issues[0]?.message ?? 'Failed to save sender');
        } else if (payload?.error) {
          setServerError(payload.error);
        } else {
          setServerError('Failed to save sender');
        }
        return;
      }

      setServerSuccess('Sender email added successfully');
      reset({
        name: '',
        email: '',
        host: '',
        port: 587,
        smtpSecurity: 'SSL/TLS',
        username: '',
        password: '',
        inboundHost: '',
        inboundPort: 993,
        inboundSecurity: 'SSL/TLS',
        inboundProtocol: 'IMAP'
      });

      void mutate('/api/senders/stats');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('Failed to save sender', error);
      setServerError('Unexpected error occurred. Please try again.');
    }
  });

  const isButtonDisabled = isSubmitting || isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Sender Name</Label>
          <Input
            id="name"
            placeholder="Sales Team"
            autoComplete="name"
            {...register('name')}
            aria-invalid={errors.name ? 'true' : 'false'}
          />
          {errors.name && (
            <p className="text-xs font-medium text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            placeholder="sender@example.com"
            autoComplete="email"
            {...register('email')}
            aria-invalid={errors.email ? 'true' : 'false'}
          />
          {errors.email && (
            <p className="text-xs font-medium text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="host">SMTP Host</Label>
          <Input
            id="host"
            placeholder="smtp.mailprovider.com"
            {...register('host')}
            aria-invalid={errors.host ? 'true' : 'false'}
          />
          {errors.host && (
            <p className="text-xs font-medium text-destructive">{errors.host.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">SMTP Port</Label>
          <Input
            id="port"
            type="number"
            inputMode="numeric"
            placeholder="587"
            {...register('port', { valueAsNumber: true })}
            aria-invalid={errors.port ? 'true' : 'false'}
          />
          {errors.port && (
            <p className="text-xs font-medium text-destructive">{errors.port.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="smtpSecurity">SMTP Security</Label>
        <Controller
          name="smtpSecurity"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={field.disabled}
            >
              <SelectTrigger
                id="smtpSecurity"
                ref={field.ref}
                onBlur={field.onBlur}
                name={field.name}
              >
                <SelectValue placeholder="Select security mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.smtpSecurity && (
          <p className="text-xs font-medium text-destructive">
            {errors.smtpSecurity.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            placeholder="smtp-user"
            autoComplete="username"
            {...register('username')}
            aria-invalid={errors.username ? 'true' : 'false'}
          />
          {errors.username && (
            <p className="text-xs font-medium text-destructive">{errors.username.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register('password')}
            aria-invalid={errors.password ? 'true' : 'false'}
          />
          {errors.password && (
            <p className="text-xs font-medium text-destructive">{errors.password.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <h3 className="font-semibold text-foreground">Inbound (IMAP/POP3)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="inboundHost">Inbound Host</Label>
            <Input
              id="inboundHost"
              placeholder="imap.mailprovider.com"
              {...register('inboundHost')}
              aria-invalid={errors.inboundHost ? 'true' : 'false'}
            />
            {errors.inboundHost && (
              <p className="text-xs font-medium text-destructive">
                {errors.inboundHost.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inboundPort">Inbound Port</Label>
            <Input
              id="inboundPort"
              type="number"
              inputMode="numeric"
              placeholder="993"
              {...register('inboundPort', { valueAsNumber: true })}
              aria-invalid={errors.inboundPort ? 'true' : 'false'}
            />
            {errors.inboundPort && (
              <p className="text-xs font-medium text-destructive">
                {errors.inboundPort.message}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="inboundSecurity">Inbound Security</Label>
            <Controller
              name="inboundSecurity"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={field.onChange}
                  disabled={field.disabled}
                >
                  <SelectTrigger
                    id="inboundSecurity"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    name={field.name}
                  >
                    <SelectValue placeholder="Select security mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                    <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.inboundSecurity && (
              <p className="text-xs font-medium text-destructive">
                {errors.inboundSecurity.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inboundProtocol">Inbound Protocol</Label>
            <Controller
              name="inboundProtocol"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={field.onChange}
                  disabled={field.disabled}
                >
                  <SelectTrigger
                    id="inboundProtocol"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    name={field.name}
                  >
                    <SelectValue placeholder="Select protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMAP">IMAP</SelectItem>
                    <SelectItem value="POP3">POP3</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.inboundProtocol && (
              <p className="text-xs font-medium text-destructive">
                {errors.inboundProtocol.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {serverError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {serverSuccess && (
        <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
          {serverSuccess}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          disabled={isButtonDisabled}
          variant="gradient"
          className="w-full sm:w-auto"
        >
          {isButtonDisabled ? 'Saving…' : 'Save Sender'}
        </Button>
      </div>
    </form>
  );
}
