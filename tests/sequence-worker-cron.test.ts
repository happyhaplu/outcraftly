import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runSequenceWorkerMock = vi.fn();

vi.mock('@/lib/workers/sequence-worker', () => ({
  runSequenceWorker: runSequenceWorkerMock
}));

type GetRoute = (request: Request) => Promise<Response>;
let GET: GetRoute;

const ORIGINAL_SECRET = process.env.SEQUENCE_WORKER_SECRET;

describe('GET /api/internal/cron/sequence-worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SEQUENCE_WORKER_SECRET = 'test-secret';
    ({ GET } = await import('@/app/api/internal/cron/sequence-worker/route'));
  });

  afterEach(() => {
    process.env.SEQUENCE_WORKER_SECRET = ORIGINAL_SECRET;
  });

  it('rejects requests without a token', async () => {
    const request = new Request('http://localhost/api/internal/cron/sequence-worker');
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runSequenceWorkerMock).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid token', async () => {
    const request = new Request('http://localhost/api/internal/cron/sequence-worker', {
      headers: { Authorization: 'Bearer wrong-token' }
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(runSequenceWorkerMock).not.toHaveBeenCalled();
  });

  it('fails with 500 when the secret is not configured', async () => {
    process.env.SEQUENCE_WORKER_SECRET = '';
    const request = new Request('http://localhost/api/internal/cron/sequence-worker?token=test-secret');
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(runSequenceWorkerMock).not.toHaveBeenCalled();
  });

  it('validates numeric parameters', async () => {
    const request = new Request('http://localhost/api/internal/cron/sequence-worker?token=test-secret&limit=abc');
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(runSequenceWorkerMock).not.toHaveBeenCalled();
  });

  it('executes the worker with parsed parameters', async () => {
    runSequenceWorkerMock.mockResolvedValueOnce({
      scanned: 3,
      sent: 2,
      failed: 0,
      retried: 1,
      skipped: 0,
      durationMs: 123,
      details: [],
      diagnostics: null
    });

    const request = new Request('http://localhost/api/internal/cron/sequence-worker?token=test-secret&limit=50&teamId=12');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(runSequenceWorkerMock).toHaveBeenCalledWith({ limit: 50, teamId: 12 });

    const payload = await response.json();
    expect(payload.result).toMatchObject({ scanned: 3, sent: 2, retried: 1 });
    expect(typeof payload.processedAt).toBe('string');
  });

  it('handles worker failures', async () => {
    runSequenceWorkerMock.mockRejectedValueOnce(new Error('boom'));

    const request = new Request('http://localhost/api/internal/cron/sequence-worker?token=test-secret');
    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
