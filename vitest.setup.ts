import '@testing-library/jest-dom/vitest';

// Set default test environment variables if not provided
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = 'test-secret-key-for-unit-tests-only-do-not-use-in-production';
}

if (!process.env.SEQUENCE_EVENTS_SECRET) {
  process.env.SEQUENCE_EVENTS_SECRET = 'test-sequence-events-secret';
}

if (!process.env.BASE_URL) {
  process.env.BASE_URL = 'http://localhost:3000';
}

if (!process.env.SENDER_CREDENTIALS_KEY) {
  process.env.SENDER_CREDENTIALS_KEY = 'test-sender-credentials-key-32-chars-long-for-encryption';
}
