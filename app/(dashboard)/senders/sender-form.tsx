'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSWRConfig } from 'swr';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    reset
  } = useForm<SenderFormValues>({
    resolver: zodResolver(senderFormSchema),
    defaultValues: {
      name: '',
      email: '',
      host: '',
      port: 587,
      username: '',
      password: ''
    }
  });

  const onSubmit = handleSubmit(async (values: SenderFormValues) => {
    setServerError(null);
    setServerSuccess(null);

    try {
      const response = await fetch('/api/senders/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
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
        username: '',
        password: ''
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
