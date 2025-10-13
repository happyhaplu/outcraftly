import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const getTeamForUserMock = vi.fn();
const getSenderForTeamMock = vi.fn();
const updateSenderStatusMock = vi.fn();
const decryptSecretMock = vi.fn();
const verifySmtpConnectionMock = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getUser: getUserMock,
  getTeamForUser: getTeamForUserMock,
  getSenderForTeam: getSenderForTeamMock,
  updateSenderStatus: updateSenderStatusMock
}));

vi.mock('@/lib/security/encryption', () => ({
  decryptSecret: decryptSecretMock
}));

vi.mock('@/lib/mail/smtp', () => ({
  verifySmtpConnection: verifySmtpConnectionMock
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/senders/verify/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ id: 1 });
  getTeamForUserMock.mockResolvedValue({ id: 10, name: 'Team' });
  getSenderForTeamMock.mockResolvedValue({
    id: 42,
    teamId: 10,
    name: 'Demo Sender',
    email: 'demo@example.com',
    host: 'smtp.example.com',
    port: 587,
    username: 'demo',
    password: 'encrypted',
    status: 'active',
    bounceRate: 1.5,
    quotaUsed: 250,
    quotaLimit: 1000,
    createdAt: new Date()
  });
  updateSenderStatusMock.mockResolvedValue({ id: 42, status: 'verified' });
  decryptSecretMock.mockReturnValue('decrypted');
  verifySmtpConnectionMock.mockResolvedValue(undefined);
});

describe('POST /api/senders/verify', () => {
  it('marks sender as verified when SMTP connection succeeds', async () => {
    const response = await POST(
      new Request('http://localhost/api/senders/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sender.status).toBe('verified');
    expect(verifySmtpConnectionMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      username: 'demo',
      password: 'decrypted'
    });
    expect(updateSenderStatusMock).toHaveBeenCalledWith(10, 42, 'verified');
  });

  it('updates status to error when SMTP verification fails', async () => {
    verifySmtpConnectionMock.mockRejectedValueOnce(new Error('Invalid credentials'));
    updateSenderStatusMock.mockResolvedValueOnce({ id: 42, status: 'error' });

    const response = await POST(
      new Request('http://localhost/api/senders/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('SMTP connection failed');
    expect(payload.sender.status).toBe('error');
    expect(updateSenderStatusMock).toHaveBeenCalledWith(10, 42, 'error');
  });

  it('returns 500 when credentials cannot be decrypted', async () => {
    decryptSecretMock.mockImplementationOnce(() => {
      throw new Error('bad key');
    });

    const response = await POST(
      new Request('http://localhost/api/senders/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 42 })
      })
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toContain('decrypt');
  });
});
