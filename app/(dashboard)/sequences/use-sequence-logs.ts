import useSWR from 'swr';

import type { DeliveryLogStatus, SequenceDeliveryLogEntry } from './types';

type SequenceLogsResponse = {
	logs: SequenceDeliveryLogEntry[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

const fetchLogs = async (url: string): Promise<SequenceLogsResponse> => {
	const response = await fetch(url, { cache: 'no-store' });

	if (response.status === 404) {
		throw new Error('Sequence not found');
	}

	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		throw new Error(
			typeof payload.error === 'string' && payload.error.length > 0
				? payload.error
				: 'Failed to load delivery logs'
		);
	}

	const payload = (await response.json()) as SequenceLogsResponse;

	return {
		logs: Array.isArray(payload.logs) ? payload.logs : [],
		page: typeof payload.page === 'number' ? payload.page : 1,
		pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : 20,
		total: typeof payload.total === 'number' ? payload.total : 0,
		totalPages: typeof payload.totalPages === 'number' ? payload.totalPages : 0
	};
};

export type SequenceLogRequestParams = {
	status: 'all' | DeliveryLogStatus;
	contact?: string;
	from?: string;
	to?: string;
	page: number;
	pageSize: number;
};

export function useSequenceLogs(sequenceId: string | null, params: SequenceLogRequestParams) {
	const searchParams = new URLSearchParams();
	searchParams.set('status', params.status);

	if (params.contact) {
		searchParams.set('contact', params.contact);
	}

	if (params.from) {
		searchParams.set('from', params.from);
	}

	if (params.to) {
		searchParams.set('to', params.to);
	}

	searchParams.set('page', params.page.toString());
	searchParams.set('pageSize', params.pageSize.toString());

	const queryString = searchParams.toString();
	const swrKey = sequenceId ? `/api/sequences/logs/${sequenceId}${queryString.length > 0 ? `?${queryString}` : ''}` : null;

	const { data, error, isValidating, mutate } = useSWR<SequenceLogsResponse>(swrKey, fetchLogs, {
		revalidateOnFocus: false
	});

	const isLoading = Boolean(swrKey) && !data && !error;

	return {
		data,
		error,
		isLoading,
		isValidating,
		refresh: () => mutate(undefined, { revalidate: true })
	} as const;
}
