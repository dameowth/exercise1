import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: "postgresql://exercise1_user:olvVtf31MwYNxgY2IDJuzXdI9lpKAisy@dpg-d29ri0ruibrs73a62gf0-a.oregon-postgres.render.com/exercise1",
  ssl: { rejectUnauthorized: true }
});

const JWT_SECRET = process.env.JWT_SECRET || 'X7kP9mQ2vL5jR8tY3uW4eH6nB1cD0fG9aS3rT2wQ8vL5jX7k';

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