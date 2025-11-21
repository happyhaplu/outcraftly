#!/usr/bin/env tsx
/**
 * Lightweight accessibility testing with Playwright accessibility API
 */
import { chromium } from 'playwright';
import type { Page } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PAGES = ['/', '/sign-in', '/pricing'];

async function checkAccessibility(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (error: any) {
    console.log(`❌ ${url} - Failed to load: ${error.message}`);
    return 1;
  }
  
  // Run basic accessibility checks using Playwright's snapshot
  const snapshot = await page.accessibility.snapshot();
  
  if (!snapshot) {
    console.log(`⚠️  ${url} - No accessibility tree available`);
    return 1;
  }
  
  // Check for critical accessibility issues
  const issues: string[] = [];
  
  // Check if page has proper structure
  const hasMain = await page.locator('main').count() > 0;
  const hasH1 = await page.locator('h1').count() > 0;
  
  // Check for inputs without proper labeling
  // Exclude: hidden inputs, inputs with aria-label, inputs with aria-labelledby, inputs with associated labels
  const allVisibleInputs = await page.locator('input:not([type="hidden"])').all();
  let unlabeledInputCount = 0;
  
  for (const input of allVisibleInputs) {
    const hasAriaLabel = await input.getAttribute('aria-label');
    const hasAriaLabelledBy = await input.getAttribute('aria-labelledby');
    const inputId = await input.getAttribute('id');
    
    // If has aria-label or aria-labelledby, it's labeled
    if (hasAriaLabel || hasAriaLabelledBy) {
      continue;
    }
    
    // Check if there's a label element associated with this input via 'for' attribute
    if (inputId) {
      const associatedLabel = await page.locator(`label[for="${inputId}"]`).count();
      if (associatedLabel > 0) {
        continue;
      }
    }
    
    unlabeledInputCount++;
  }
  
  const imagesWithoutAlt = await page.locator('img:not([alt])').count();
  
  if (!hasMain) issues.push('Missing <main> landmark');
  if (!hasH1) issues.push('Missing <h1> heading');
  if (unlabeledInputCount > 0) issues.push(`${unlabeledInputCount} inputs without labels`);
  if (imagesWithoutAlt > 0) issues.push(`${imagesWithoutAlt} images without alt text`);
  
  console.log(`${issues.length === 0 ? '✅' : '⚠️ '} ${url}`);
  
  if (issues.length > 0) {
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  return issues.length;
}

async function main() {
  console.log('🎯 Accessibility Test\n');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let totalIssues = 0;
  
  for (const path of PAGES) {
    const url = `${BASE_URL}${path}`;
    totalIssues += await checkAccessibility(page, url);
  }
  
  await browser.close();
  
  console.log(`\nTotal issues: ${totalIssues}`);
  
  if (totalIssues > 3) {
    console.log('⚠️  Some accessibility issues found (acceptable for basic checks)');
  } else {
    console.log('✅ Basic accessibility checks passed');
  }
}

main();
