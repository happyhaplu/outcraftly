# Testing Guide

## Quick Start

```bash
# Unit tests (fast)
pnpm test:unit

# Regression tests (Playwright E2E)
pnpm test:regression

# Accessibility check
pnpm test:accessibility

# Load testing
pnpm test:load
```

## Test Types

### 1. Unit & Integration Tests
**Command:** `pnpm test:unit` or `pnpm test:ci`

- 254+ tests using Vitest
- Located in `tests/` and `app/**/__tests__/`
- Fast, runs in <20 seconds

### 2. Regression Testing (Playwright)
**Command:** `pnpm test:regression`

- End-to-end browser tests with `@regression` tag
- Critical user flows: auth, homepage, API health
- Chromium only for speed (add more browsers in `playwright.config.ts` if needed)

**Run all E2E tests:**
```bash
pnpm test:playwright
```

**Debug mode:**
```bash
pnpm test:playwright:ui
```

### 3. Accessibility Testing
**Command:** `pnpm test:accessibility`

- WCAG 2.1 AA compliance using axe-core
- Tests: homepage, sign-in, pricing pages
- Zero violations expected

### 4. Load Testing
**Command:** `pnpm test:load`

- Tests API endpoints under load using autocannon
- Default: 5s duration, 10 concurrent connections
- Customize:
  ```bash
  LOAD_TEST_DURATION=30 LOAD_TEST_CONNECTIONS=50 pnpm test:load
  ```

## Pre-Deployment Checklist

```bash
pnpm lint          # Code quality
pnpm test:ci       # All unit tests with coverage
pnpm build         # Production build
pnpm test:regression  # Critical flows (optional)
```

## CI Pipeline

GitHub Actions runs on every push/PR:
- ✅ Linting
- ✅ TypeScript compilation
- ✅ Unit & integration tests
- ✅ Production build
- ✅ Coverage reports

## Configuration

- **Vitest**: `vitest.config.ts`
- **Playwright**: `playwright.config.ts` (single browser for speed)
- **Load tests**: Environment variables (LOAD_TEST_DURATION, LOAD_TEST_CONNECTIONS)

## Adding Tests

### Regression test (Playwright)
```typescript
// e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('feature works @regression', async ({ page }) => {
  await page.goto('/my-feature');
  await expect(page.locator('h1')).toBeVisible();
});
```

### Accessibility check
```typescript
import AxeBuilder from '@axe-core/playwright';

test('is accessible', async ({ page }) => {
  await page.goto('/my-page');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

## Troubleshooting

**Playwright browser not installed:**
```bash
pnpm exec playwright install chromium
```

**Tests timeout:**
- Increase timeout in test: `test('...', { timeout: 30000 })`
- Check database connections

**Accessibility violations:**
- Review specific issues in output
- Check WCAG guidelines
- Use browser DevTools Accessibility panel

