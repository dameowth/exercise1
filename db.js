import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: "postgresql://iot4_iym0_user:2QaZucv26ADb9cL6hAFVdf1msSloHIS8@dpg-d1i9fver433s73a7a0mg-a.oregon-postgres.render.com/iot4_iym0",
  ssl: { rejectUnauthorized: true }
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ Conexión exitosa a la base de datos");
    client.release();
  } catch (err) {
    console.error("❌ Error al conectar a la base de datos:", err.message);
    process.exit(1);
  }
}
testConnection();

export default pool;