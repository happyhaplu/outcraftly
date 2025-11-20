# Quick Testing Reference

## ⚡ Fast (< 20 seconds)
```bash
pnpm test:unit          # 254+ unit tests
pnpm lint               # Code quality check
```

## 🔄 Regression (~ 30 seconds)
```bash
pnpm test:regression    # Critical E2E flows with @regression tag
pnpm test:playwright    # All Playwright E2E tests
```

## ♿ Accessibility (~ 15 seconds)
```bash
pnpm test:accessibility # WCAG 2.1 AA compliance
```

## 🚀 Load Testing (~ 10 seconds)
```bash
pnpm test:load          # Default: 5s duration, 10 connections

# Customize:
LOAD_TEST_DURATION=30 LOAD_TEST_CONNECTIONS=50 pnpm test:load
```

## 📦 Pre-Deployment
```bash
pnpm lint && pnpm test:ci && pnpm build
```

## 🐛 Debug
```bash
pnpm test:watch         # Watch mode for unit tests
pnpm test:playwright:ui # Playwright UI mode
```

## 📊 Coverage
```bash
pnpm test:ci            # Generates coverage/ directory
```

---

**See [TESTING.md](./TESTING.md) for full documentation**
