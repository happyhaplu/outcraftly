import { test, expect } from '@playwright/test';

test.describe('API Health', () => {
  test('health endpoint responds @regression', async ({ request }) => {
    const response = await request.get('/api/healthz');
    expect(response.ok()).toBeTruthy();
  });
});
