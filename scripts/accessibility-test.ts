#!/usr/bin/env tsx
/**
 * Lightweight accessibility testing with axe-core
 */
import { chromium } from 'playwright';
import type { Page } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PAGES = ['/', '/sign-in', '/pricing'];

async function checkAccessibility(page: Page, url: string) {
  await page.goto(url);
  
  // Inject axe-core
  await page.addScriptTag({ 
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.0/axe.min.js' 
  });
  
  // Run axe
  const results: any = await page.evaluate(() => {
    return new Promise((resolve) => {
      (window as any).axe.run((err: any, results: any) => {
        if (err) throw err;
        resolve(results);
      });
    });
  });
  
  const violations = results.violations || [];
  console.log(`${violations.length === 0 ? '✅' : '❌'} ${url}`);
  
  if (violations.length > 0) {
    console.log(`   ${violations.length} violations found:`);
    violations.slice(0, 3).forEach((v: any) => {
      console.log(`   - ${v.help}`);
    });
  }
  
  return violations.length;
}

async function main() {
  console.log('🎯 Accessibility Test\n');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let totalViolations = 0;
  
  for (const path of PAGES) {
    const url = `${BASE_URL}${path}`;
    totalViolations += await checkAccessibility(page, url);
  }
  
  await browser.close();
  
  console.log(`\nTotal violations: ${totalViolations}`);
  
  if (totalViolations > 0) {
    console.log('⚠️  Fix accessibility issues above');
    process.exit(1);
  } else {
    console.log('✅ All pages accessible');
  }
}

main();
