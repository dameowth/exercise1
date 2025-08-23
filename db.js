import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ Conexión exitosa a la base de datos");
    client.release();
    return true;
  } catch (err) {
    console.error("❌ Error al conectar a la base de datos:", err.message);
    return false;
  }
}

export { pool, testConnection };