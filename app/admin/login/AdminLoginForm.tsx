'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ActionState } from '@/lib/auth/middleware';
import { adminSignIn } from '@/app/admin/actions';

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    adminSignIn,
    {}
  );

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-background via-transparent to-primary/10 px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="space-y-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-semibold">Admin Access</CardTitle>
              <CardDescription className="text-base">
                Sign in with your administrator credentials to manage Outcraftly.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-8">
            <form className="space-y-5" action={formAction}>
              <div className="space-y-2">
                <Label htmlFor="email">Admin email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@company.com"
                  defaultValue={state?.email ?? ''}
                  maxLength={255}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  minLength={8}
                  maxLength={100}
                  required
                />
              </div>

              {state?.error && (
                <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Need the regular workspace?{' '}
              <Link href="/sign-in" className="font-medium text-primary hover:text-primary/80">
                Go to member login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
