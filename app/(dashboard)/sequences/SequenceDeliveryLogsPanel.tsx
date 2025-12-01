"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, Calendar, Loader2, RefreshCcw, Search, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { DeliveryLogStatus, SequenceDeliveryLogEntry } from './types';
import { useSequenceLogs } from './use-sequence-logs';

const STATUS_OPTIONS: Array<{ value: 'all' | DeliveryLogStatus; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'sent', label: 'Sent' },
	{ value: 'replied', label: 'Replied' },
	{ value: 'bounced', label: 'Bounced' },
	{ value: 'retrying', label: 'Retrying' },
	{ value: 'delayed', label: 'Delayed' },
	{ value: 'failed', label: 'Failed' },
	{ value: 'skipped', label: 'Skipped' },
	{ value: 'manual_send', label: 'Manual sends' }
];

const STATUS_LABEL: Record<DeliveryLogStatus, string> = {
	sent: 'Sent',
	replied: 'Replied',
	bounced: 'Bounced',
	retrying: 'Retrying',
	failed: 'Failed',
	skipped: 'Skipped',
	delayed: 'Delayed',
	manual_send: 'Manual send'
};

const STATUS_BADGE_CLASS: Record<DeliveryLogStatus, string> = {
	sent: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
	replied: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
	bounced: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
	retrying: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
	failed: 'bg-red-500/10 text-red-600 border-red-500/30',
	skipped: 'bg-slate-500/10 text-slate-600 border-slate-500/30',
	delayed: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
	manual_send: 'bg-sky-500/10 text-sky-600 border-sky-500/30'
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(date);
}

function formatDelayDuration(delayMs: number | null) {
	if (delayMs == null || Number.isNaN(delayMs) || delayMs <= 0) {
		return null;
	}

	const totalSeconds = Math.round(delayMs / 1000);
	if (totalSeconds <= 0) {
		return '1 second';
	}

	if (totalSeconds < 60) {
		return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
	}

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (seconds === 0) {
		return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	}

	return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
}

function formatContactName(options: { firstName: string | null; lastName: string | null; email: string }) {
	const parts = [options.firstName, options.lastName].map((part) => part?.trim()).filter(Boolean);
	if (parts.length === 0) {
		return options.email;
	}
	return parts.join(' ');
}

type SequenceDeliveryLogsPanelProps = {
	sequenceId: string;
};

export function SequenceDeliveryLogsPanel(props: SequenceDeliveryLogsPanelProps) {
	return <SequenceDeliveryLogsPanelInner key={props.sequenceId} {...props} />;
}

function SequenceDeliveryLogsPanelInner({ sequenceId }: SequenceDeliveryLogsPanelProps) {
	const [status, setStatus] = useState<'all' | DeliveryLogStatus>('all');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);

	const [contactInput, setContactInput] = useState('');
	const [contactFilter, setContactFilter] = useState<string | undefined>();

	const [fromInput, setFromInput] = useState('');
	const [toInput, setToInput] = useState('');
	const [fromFilter, setFromFilter] = useState<string | undefined>();
	const [toFilter, setToFilter] = useState<string | undefined>();

	const { data, error, isLoading, isValidating, refresh } = useSequenceLogs(sequenceId, {
		status,
		contact: contactFilter,
		from: fromFilter,
		to: toFilter,
		page,
		pageSize
	});

	const logs = (data?.logs ?? []) as SequenceDeliveryLogEntry[];
	const total = data?.total ?? 0;
	const totalPages = data?.totalPages ?? 0;

	const handleApplyFilters = () => {
		setContactFilter(contactInput.trim() === '' ? undefined : contactInput.trim());
		setFromFilter(fromInput.trim() === '' ? undefined : fromInput.trim());
		setToFilter(toInput.trim() === '' ? undefined : toInput.trim());
		setPage(1);
	};

	const handleResetFilters = () => {
		setContactInput('');
		setFromInput('');
		setToInput('');
		setContactFilter(undefined);
		setFromFilter(undefined);
		setToFilter(undefined);
		setStatus('all');
		setPage(1);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		handleApplyFilters();
	};

	const handleStatusChange = (nextStatus: 'all' | DeliveryLogStatus) => {
		setStatus(nextStatus);
		setPage(1);
	};

	const handlePageSizeChange = (nextSize: number) => {
		setPageSize(nextSize);
		setPage(1);
	};

	const pageInfo = useMemo(() => {
		if (total === 0) {
			return 'Showing 0 results';
		}

		const start = (page - 1) * pageSize + 1;
		const end = Math.min(page * pageSize, total);
		return `Showing ${start}-${end} of ${total}`;
	}, [page, pageSize, total]);

	return (
		<div className="space-y-6">
			<Card>
				<CardContent className="space-y-4 pt-6">
					<form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={handleSubmit}>
						<div className="relative">
							<Input
								value={contactInput}
								onChange={(event) => setContactInput(event.target.value)}
								placeholder="Search by contact or email"
								className="pl-9"
							/>
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
						</div>
						<div className="relative">
							<Input
								type="date"
								value={fromInput}
								onChange={(event) => setFromInput(event.target.value)}
								max={toInput || undefined}
								className="pl-9"
							/>
							<Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
						</div>
						<div className="relative">
							<Input
								type="date"
								value={toInput}
								onChange={(event) => setToInput(event.target.value)}
								min={fromInput || undefined}
								className="pl-9"
							/>
							<Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
						</div>
						<div className="flex items-center gap-2">
							<Button type="submit" variant="secondary" className="w-full whitespace-nowrap md:w-auto">
								Apply filters
							</Button>
							<Button type="button" variant="ghost" onClick={handleResetFilters} className="w-full whitespace-nowrap md:w-auto">
								Reset
							</Button>
						</div>
					</form>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							{STATUS_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => handleStatusChange(option.value)}
									className={cn(
										'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
										status === option.value
											? 'border-primary bg-primary/10 text-primary'
											: 'border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
									)}
									aria-pressed={status === option.value}
								>
									{option.label}
								</button>
							))}
						</div>
						<div className="flex items-center gap-2">
							<select
								value={pageSize}
								onChange={(event) => handlePageSizeChange(Number(event.target.value))}
								className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm focus:outline-none"
							>
								{PAGE_SIZE_OPTIONS.map((size) => (
									<option key={size} value={size} className="text-foreground">
										{size} / page
									</option>
								))}
							</select>
							<Button type="button" variant="outline" size="sm" onClick={() => refresh()} disabled={isValidating}>
								{isValidating ? (
									<span className="flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
										Refreshing
									</span>
								) : (
									<span className="flex items-center gap-2">
										<RefreshCcw className="h-4 w-4" aria-hidden />
										Refresh
									</span>
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{error ? (
				<div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					<AlertCircle className="mt-0.5 h-4 w-4" aria-hidden />
					<div>
						<p className="font-semibold">Unable to load delivery logs</p>
						<p className="text-destructive/80">{error.message}</p>
					</div>
				</div>
			) : null}

			<Card>
				<CardContent className="space-y-4 pt-6">
					{isLoading ? (
						<div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
							Loading logs...
						</div>
					) : logs.length === 0 ? (
						<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
							<div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
								<User className="size-6 text-muted-foreground" aria-hidden />
							</div>
							<h3 className="text-lg font-semibold text-foreground">No delivery activity yet</h3>
							<p className="mt-2 max-w-sm text-sm text-muted-foreground">
								Once this sequence starts sending, delivery attempts will appear here with their status and any errors we detected.
							</p>
						</div>
					) : (
						<div className="space-y-4">
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-border/60 text-left text-sm">
									<thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
										<tr>
											<th className="px-4 py-3 font-semibold">Contact</th>
											<th className="px-4 py-3 font-semibold">Step</th>
											<th className="px-4 py-3 font-semibold">Status</th>
											<th className="px-4 py-3 font-semibold">Attempts</th>
											<th className="px-4 py-3 font-semibold">Message ID</th>
											<th className="px-4 py-3 font-semibold">Recorded</th>
											<th className="px-4 py-3 font-semibold">Details</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border/40 bg-background">
										{logs.map((log) => {
											const statusLabel = STATUS_LABEL[log.status] ?? log.status;
											const badgeClass = STATUS_BADGE_CLASS[log.status] ?? 'border-border/60 bg-muted/50 text-muted-foreground';
											const detailsContent = (() => {
												if (log.status === 'skipped') {
													const reasonLabel = (() => {
														switch (log.skipReason) {
															case 'draft':
																return 'Sequence is still in draft';
															case 'paused':
																return 'Sequence is paused';
															case 'deleted':
																return 'Sequence was deleted';
															case 'status_changed':
																return 'Contact status changed before send';
															case 'reply_stop':
																return 'Skipped because the contact replied';
															case 'reply_delay':
																return 'Waiting to follow up after a reply';
															case 'bounce_policy':
																return 'Skipped due to a recorded bounce';
															case 'outside_window':
																return 'Waiting for the allowed send window';
															default:
																return 'Skipped';
														}
													})();

													const rescheduleNote =
														log.skipReason === 'reply_delay' && log.rescheduledFor
															? `Rescheduled for ${formatDateTime(log.rescheduledFor)}`
														: null;

													return (
														<div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
														<span>{reasonLabel}</span>
														{rescheduleNote ? <span className="text-[11px] text-muted-foreground/80">{rescheduleNote}</span> : null}
													</div>
													);
												}

												if (log.status === 'delayed') {
													const reasonLabel = log.delayReason === 'delayed_due_to_min_gap'
														? 'Delayed to respect the minimum send interval'
														: 'Delivery delayed';
													const delayLabel = formatDelayDuration(log.delayMs);
													const minIntervalLabel = typeof log.minIntervalMinutes === 'number'
														? `Minimum interval: ${log.minIntervalMinutes} minute${log.minIntervalMinutes === 1 ? '' : 's'}`
														: null;

													return (
														<div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
															<span>{reasonLabel}</span>
															{delayLabel ? (
																<span className="text-[11px] text-muted-foreground/80">Delay applied: {delayLabel}</span>
															) : null}
															{minIntervalLabel ? (
																<span className="text-[11px] text-muted-foreground/80">{minIntervalLabel}</span>
															) : null}
														</div>
													);
												}

												if (log.errorMessage) {
													return (
														<span className="text-xs text-destructive" title={log.errorMessage}>
															{log.errorMessage}
														</span>
													);
												}

												return <span className="text-muted-foreground/70">—</span>;
											})();
											return (
												<tr key={log.id}>
													<td className="px-4 py-3">
														<div className="flex flex-col">
															<span className="font-medium text-foreground">
																{formatContactName(log.contact)}
															</span>
															<span className="text-xs text-muted-foreground">{log.contact.email}</span>
														</div>
													</td>
													<td className="px-4 py-3 text-sm text-muted-foreground">
														{log.step?.order != null ? `Step ${log.step.order}` : 'Unknown step'}
														{log.step?.subject ? (
															<div className="text-xs text-muted-foreground/80">{log.step.subject}</div>
														) : null}
													</td>
													<td className="px-4 py-3">
														<Badge variant="outline" className={cn('border px-2 py-0.5 text-xs font-medium', badgeClass)}>
															{statusLabel}
														</Badge>
													</td>
													<td className="px-4 py-3 text-sm text-muted-foreground">{log.attempts}</td>
													<td className="px-4 py-3 text-sm text-muted-foreground">
														{log.messageId ? (
															<span className="font-mono text-xs">{log.messageId}</span>
														) : (
															<span className="text-muted-foreground/70">—</span>
														)}
													</td>
													<td className="px-4 py-3 text-sm text-muted-foreground">
														<span suppressHydrationWarning>{formatDateTime(log.createdAt)}</span>
													</td>
													<td className="px-4 py-3 text-sm text-muted-foreground">{detailsContent}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>{pageInfo}</span>
								<div className="flex items-center gap-2">
									<Button type="button" variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
										Previous
									</Button>
									<span>
										Page {totalPages === 0 ? 0 : page} of {totalPages}
									</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setPage((value) => (totalPages === 0 ? value : Math.min(totalPages, value + 1)))}
										disabled={totalPages === 0 || page >= totalPages}
									>
										Next
									</Button>
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
