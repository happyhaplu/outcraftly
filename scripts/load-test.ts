#!/usr/bin/env tsx
/**
 * Lightweight load testing with autocannon
 */
import autocannon from 'autocannon';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DURATION = parseInt(process.env.LOAD_TEST_DURATION || '5', 10);
const CONNECTIONS = parseInt(process.env.LOAD_TEST_CONNECTIONS || '10', 10);

async function runTest(endpoint: string) {
  console.log(`\n📊 Testing: ${endpoint}`);
  
  const result = await autocannon({
    url: `${BASE_URL}${endpoint}`,
    connections: CONNECTIONS,
    duration: DURATION,
  });

  console.log(`   Requests: ${result.requests.total} (${result.requests.average.toFixed(1)}/sec)`);
  console.log(`   Latency: ${result.latency.mean.toFixed(1)}ms avg`);
  console.log(`   Errors: ${result.errors}`);
  
  if (result.errors > result.requests.total * 0.05) {
    throw new Error('High error rate');
  }
  
  return result;
}

async function main() {
  console.log('🚀 Load Test');
  console.log(`Target: ${BASE_URL} | Duration: ${DURATION}s | Connections: ${CONNECTIONS}\n`);
  
  try {
    await runTest('/api/healthz');
    await runTest('/');
    console.log('\n✅ Load tests passed');
  } catch (error: any) {
    console.error('\n❌ Load test failed:', error.message);
    process.exit(1);
  }
}

main();
