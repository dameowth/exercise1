import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: "postgresql://iot4_iym0_user:2QaZucv26ADb9cL6hAFVdf1msSloHIS8@dpg-d1i9fver433s73a7a0mg-a.oregon-postgres.render.com/iot4_iym0",
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
