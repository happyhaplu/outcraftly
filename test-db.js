const { Pool } = require('pg');
require('dotenv').config();

async function test() {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  
  try {
    console.log('Testing database connection...');
    const plansResult = await pool.query('SELECT name, max_prospects, max_emails_per_month, is_active, is_trial FROM plans ORDER BY sort_order');
    console.log('\nPlans in database:');
    console.log(JSON.stringify(plansResult.rows, null, 2));
    
    const teamsResult = await pool.query('SELECT id, name, plan_name FROM teams LIMIT 5');
    console.log('\nTeams in database:');
    console.log(JSON.stringify(teamsResult.rows, null, 2));
    
    await pool.end();
    console.log('\nDatabase test completed successfully!');
  } catch (err) {
    console.error('Database error:', err);
    await pool.end();
    process.exit(1);
  }
}

test();
