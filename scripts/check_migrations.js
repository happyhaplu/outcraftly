const postgres = require('postgres');
(async ()=>{
  try{
    const sql = postgres(process.env.POSTGRES_URL || 'postgresql://postgres:8uzckV2cuTEaqTzt@db.dyaicmlhvpmkcivlmcgn.supabase.co:5432/postgres');
    const rows = await sql`SELECT id, name, applied_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 50`;
    console.log(JSON.stringify(rows, null, 2));
    await sql.end();
  }catch(e){
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
