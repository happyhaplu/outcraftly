'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from '@/components/ui/card';
import { Loader2, Sparkles } from 'lucide-react';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );
  const isSignUp = mode === 'signup';
  const toggleParams = new URLSearchParams();
  if (redirect) toggleParams.set('redirect', redirect);
  if (priceId) toggleParams.set('priceId', priceId);
  if (inviteId) toggleParams.set('inviteId', inviteId);
  const toggleQuery = toggleParams.toString();
  const toggleHref = `${isSignUp ? '/sign-in' : '/sign-up'}${
    toggleQuery ? `?${toggleQuery}` : ''
  }`;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-primary/5 via-transparent to-primary/10 px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="p-0 shadow-xl">
          <CardHeader className="space-y-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h1>
              <CardDescription className="text-base">
                {isSignUp
                  ? 'Start building with the Outcraftly platform in minutes.'
                  : 'Sign in to continue to your workspace.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-8">
            <form className="space-y-5" action={formAction}>
              <input type="hidden" name="redirect" value={redirect || ''} aria-label="Redirect URL" />
              <input type="hidden" name="priceId" value={priceId || ''} aria-label="Price ID" />
              <input type="hidden" name="inviteId" value={inviteId || ''} aria-label="Invite ID" />

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    defaultValue={state.name}
                    placeholder="Jane Doe"
                    maxLength={100}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={state.email}
                  placeholder="name@company.com"
                  maxLength={80}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    isSignUp ? 'new-password' : 'current-password'
                  }
                  defaultValue={state.password}
                  placeholder="Create a strong password"
                  minLength={8}
                  maxLength={100}
                  required
                />
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    defaultValue={state.confirmPassword}
                    placeholder="Re-enter your password"
                    minLength={8}
                    maxLength={100}
                    required
                  />
                </div>
              )}

              {state?.error && (
                <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isSignUp ? 'Creating account...' : 'Signing you in...'}
                  </>
                ) : isSignUp ? (
                  'Create account'
                ) : (
                  'Continue'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <Link href={toggleHref} className="font-medium text-primary hover:text-primary/80">
                {isSignUp ? 'Sign in' : 'Create one'}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
