import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: "postgresql://iot4_user:aJ0WNKvQIlYN9ftysmQ1Y1SJsb4iMwIt@dpg-d0vknr8gjchc7388rh2g-a.oregon-postgres.render.com/iot4",
  ssl: { rejectUnauthorized: true }
});

export default pool;

/*async function testConection() {
  try {
    const client = await pool.connect();
    console.log("Connection Successful");
    client.release();
    await pool.end();
  } catch (err) {
    console.err("Error to connect", err);
  }
}
testConection();*/
