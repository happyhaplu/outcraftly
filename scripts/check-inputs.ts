#!/usr/bin/env tsx
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/sign-in');
  
  // Find all visible inputs without labels
  const inputs = await page.locator('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])').all();
  
  console.log(`Found ${inputs.length} inputs without labels:\n`);
  
  for (const input of inputs) {
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const id = await input.getAttribute('id');
    const placeholder = await input.getAttribute('placeholder');
    
    console.log(`Type: ${type}, Name: ${name}, ID: ${id}, Placeholder: ${placeholder}`);
  }
  
  await browser.close();
}

main();
