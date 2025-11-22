const { Pool } = require('pg');
require('dotenv').config();

async function fix() {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  
  try {
    console.log('Updating teams without plan_name to use Starter plan...');
    const result = await pool.query(`
      UPDATE teams 
      SET plan_name = 'Starter', updated_at = NOW() 
      WHERE plan_name IS NULL
      RETURNING id, name, plan_name
    `);
    
    console.log(`Updated ${result.rowCount} teams:`);
    result.rows.forEach(team => {
      console.log(`  - Team ${team.id}: "${team.name}" → ${team.plan_name}`);
    });
    
    await pool.end();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

fix();
