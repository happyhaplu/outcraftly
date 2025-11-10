'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription
} from '@/components/ui/card';
import { customerPortalAction } from '@/lib/payments/actions';
import { useActionState } from 'react';
import { TeamDataWithMembers, User } from '@/lib/db/schema';
import { removeTeamMember, inviteTeamMember } from '@/app/(login)/actions';
import useSWR from 'swr';
import { Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle } from 'lucide-react';

type ActionState = {
  error?: string;
  success?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SubscriptionSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Team Subscription</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ManageSubscription() {
  const { data: teamData } = useSWR<TeamDataWithMembers>('/api/team', fetcher);

  return (
    <Card className="mb-8 transition-shadow hover:shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Subscription</CardTitle>
        <CardDescription>
          Manage billing, invoices, and plan details through your Stripe
          portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 p-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
              Current plan
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {teamData?.planName || 'Free'}
            </p>
            <p className="text-sm text-muted-foreground">
              {teamData?.subscriptionStatus === 'active'
                ? 'Billed monthly'
                : teamData?.subscriptionStatus === 'trialing'
                ? 'Trial period active'
                : 'No active subscription'}
            </p>
          </div>
          <form action={customerPortalAction}>
            <Button type="submit" className="w-full md:w-auto" variant="gradient">
              Manage subscription
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembersSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4 mt-1">
          <div className="flex items-center space-x-4">
            <div className="size-8 rounded-full bg-gray-200"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 rounded"></div>
              <div className="h-3 w-14 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembers() {
  const { data: teamData } = useSWR<TeamDataWithMembers>('/api/team', fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeTeamMember, {});

  const getUserDisplayName = (user: Pick<User, 'id' | 'name' | 'email'>) => {
    return user.name || user.email || 'Unknown User';
  };

  if (!teamData?.teamMembers?.length) {
    return (
      <Card className="mb-8 transition-shadow hover:shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Team Members</CardTitle>
          <CardDescription>
            Invite teammates to collaborate and manage your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No team members yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 transition-shadow hover:shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Team Members</CardTitle>
        <CardDescription>
          Manage roles and access levels for everyone in your organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border/70">
          <ul className="divide-y divide-border/60">
            {teamData.teamMembers.map((member, index) => (
              <li
                key={member.id}
                className="flex flex-col gap-4 bg-background/80 px-5 py-4 transition-colors hover:bg-muted/60 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="border border-primary/20">
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground font-semibold">
                      {getUserDisplayName(member.user)
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {getUserDisplayName(member.user)}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {member.role}
                    </p>
                  </div>
                </div>
                {index > 1 ? (
                  <form action={removeAction} className="flex justify-end md:justify-start">
                    <input type="hidden" name="memberId" value={member.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={isRemovePending}
                    >
                      {isRemovePending ? 'Removing...' : 'Remove'}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {removeState?.error && (
          <p className="mt-4 text-sm text-destructive">{removeState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteTeamMemberSkeleton() {
  return (
    <Card className="h-[260px]">
      <CardHeader>
        <CardTitle>Invite Team Member</CardTitle>
      </CardHeader>
    </Card>
  );
}

function InviteTeamMember() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const { data: teamData } = useSWR<TeamDataWithMembers>('/api/team', fetcher);
  const currentMemberRole = teamData?.teamMembers?.find(
    (member) => member.user.id === user?.id
  )?.role;
  const isOwner = currentMemberRole === 'owner';
  const [inviteState, inviteAction, isInvitePending] = useActionState<
    ActionState,
    FormData
  >(inviteTeamMember, {});

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Invite Team Member</CardTitle>
        <CardDescription>
          Invite collaborators by email and choose their starting role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Enter email"
              required
              disabled={!isOwner}
            />
          </div>
          <div>
            <Label>Role</Label>
            <RadioGroup
              defaultValue="member"
              name="role"
              className="flex space-x-4"
              disabled={!isOwner}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="member" id="member" />
                <Label htmlFor="member">Member</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="owner" id="owner" />
                <Label htmlFor="owner">Owner</Label>
              </div>
            </RadioGroup>
          </div>
          {inviteState?.error && (
            <p className="text-sm text-destructive">{inviteState.error}</p>
          )}
          {inviteState?.success && (
            <p className="text-sm text-success">{inviteState.success}</p>
          )}
          <Button type="submit" disabled={isInvitePending || !isOwner} variant="gradient">
            {isInvitePending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Member
              </>
            )}
          </Button>
        </form>
      </CardContent>
      {!isOwner && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            You must be a team owner to invite new members.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <section className="flex-1 space-y-8 animate-fade-in">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
          Workspace
        </p>
        <h1 className="text-3xl font-bold text-foreground">
          Team settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Keep billing information updated, manage roles, and invite new collaborators.
        </p>
      </div>
      <Suspense fallback={<SubscriptionSkeleton />}>
        <ManageSubscription />
      </Suspense>
      <Suspense fallback={<TeamMembersSkeleton />}>
        <TeamMembers />
      </Suspense>
      <Suspense fallback={<InviteTeamMemberSkeleton />}>
        <InviteTeamMember />
      </Suspense>
    </section>
  );
}
