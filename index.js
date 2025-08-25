import { pool, testConnection } from "./db.js";
import express from "express";
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(cors({
  origin: [
    'https://exercise1-nt4i.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://frontend-p5su.onrender.com'
  ]
}));
app.use(limiter);
app.use(express.json());

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

async function initializeTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS data (
        id SERIAL PRIMARY KEY,
        deviceName VARCHAR(100) NOT NULL,
        enrollId VARCHAR(20) NOT NULL UNIQUE,
        value TIMESTAMP NOT NULL,
        device_status BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_logs (
        id SERIAL PRIMARY KEY,
        enrollId VARCHAR(20) NOT NULL REFERENCES data(enrollId) ON DELETE CASCADE,
        action VARCHAR(10) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER REFERENCES users(id)
      )
    `);
    console.log("✅ Tables initialized");
  } catch (error) {
    console.error("❌ Error initializing tables:", error.message);
    throw error;
  }
}

async function startServer() {
  if (!await testConnection()) {
    console.error("❌ Cannot start server without DB connection");
    process.exit(1);
  }
  await initializeTables();

  // User Signup
  app.post("/user/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "All fields required" });
    }
    try {
      const check = await pool.query(`SELECT 1 FROM users WHERE email = $1 OR username = $2`, [email.trim(), username.trim()]);
      if (check.rowCount > 0) {
        return res.status(409).json({ error: "User or email exists" });
      }
      const hashed = await bcrypt.hash(password.trim(), 10);
      await pool.query(`INSERT INTO users (username, email, password) VALUES ($1, $2, $3)`, [username.trim(), email.trim(), hashed]);
      res.status(201).json({ message: "✅ User registered" });
    } catch (error) {
      console.error("❌ Error in /user/signup:", error.message);
      res.status(500).json({ error: "Error registering user" });
    }
  });

  // User Login (from provided)
  app.post("/user/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "All fields required" });
    }
    try {
      const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.trim()]);
      if (result.rowCount === 0) return res.status(401).json({ error: "Invalid credentials" });
      const user = result.rows[0];
      if (!await bcrypt.compare(password.trim(), user.password)) return res.status(401).json({ error: "Invalid credentials" });
      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
      res.status(200).json({ message: "Login successful", token });
    } catch (error) {
      console.error("❌ Error in /user/login:", error.message);  // Sanitized: no req.body
      res.status(500).json({ error: "Error logging in" });
    }
  });

  // Save Data (Device Register)
  app.post("/save-data", async (req, res) => {
    const { deviceName, enrollId, value } = req.body;  // Destructure first
    if (!deviceName?.trim() || !enrollId?.trim() || !value?.trim()) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (!/^[A-Za-z\s]{1,100}$/.test(deviceName.trim())) {
      return res.status(400).json({ error: "Invalid device name" });
    }
    if (!/^[A-Za-z0-9]{1,20}$/.test(enrollId.trim())) {
      return res.status(400).json({ error: "Invalid enrollId" });
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())) {
      return res.status(400).json({ error: "Invalid timestamp format" });
    }
    if (!req.user?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    try {
      const check = await pool.query(`SELECT 1 FROM data WHERE enrollId = $1`, [enrollId.trim()]);
      if (check.rowCount > 0) return res.status(409).json({ error: "EnrollId exists" });
      const result = await pool.query(
        `INSERT INTO data (deviceName, enrollId, value) VALUES ($1, $2, $3) RETURNING *`,
        [deviceName.trim(), enrollId.trim(), value.trim()]
      );
      await pool.query(
        `INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`,
        [enrollId.trim(), 'REGISTER', req.user.id]
      );
      res.status(201).json({ message: "✅ Data saved", data: result.rows[0] });
    } catch (error) {
      console.error("❌ Error in /save-data:", error.message);
      res.status(500).json({ error: "Error saving data" });
    }
  });

  // Get Data
  app.get("/get-data", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM data ORDER BY created_at DESC`);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ Error in /get-data:", error.message);
    res.status(500).json({ error: "Error fetching data" });
  }
});

  // Turn On
  app.post("/device/turn-on", async (req, res) => {
    const { enrollId } = req.body;
    if (!enrollId?.trim()) return res.status(400).json({ error: "enrollId required" });
    try {
      const result = await pool.query(`UPDATE data SET device_status = TRUE WHERE enrollId = $1 RETURNING *`, [enrollId.trim()]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Device not found" });
      await pool.query(`INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`, [enrollId.trim(), 'TURN_ON', req.user.id]);
      res.status(200).json({ message: "✅ Device turned on", data: result.rows[0] });
    } catch (error) {
      console.error("❌ Error in /device/turn-on:", error.message);
      res.status(500).json({ error: "Error turning on device" });
    }
  });

  app.post("/device/turn-off", async (req, res) => {
    const { enrollId } = req.body;
    if (!enrollId?.trim()) return res.status(400).json({ error: "enrollId required" });
    try {
      const result = await pool.query(`UPDATE data SET device_status = FALSE WHERE enrollId = $1 RETURNING *`, [enrollId.trim()]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Device not found" });
      await pool.query(`INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`, [enrollId.trim(), 'TURN_OFF', req.user.id]);
      res.status(200).json({ message: "✅ Device turned off", data: result.rows[0] });
    } catch (error) {
      console.error("❌ Error in /device/turn-off:", error.message);
      res.status(500).json({ error: "Error turning off device" });
    }
  });

  // Status
  app.get("/device/status/:enrollId", async (req, res) => {
    const { enrollId } = req.params;
    try {
      const result = await pool.query(`SELECT device_status FROM data WHERE enrollId = $1`, [enrollId]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Device not found" });
      res.status(200).json({ message: "✅ Status fetched", device_status: result.rows[0].device_status });
    } catch (error) {
      console.error("❌ Error in /device/status:", error.message);
      res.status(500).json({ error: "Error fetching status" });
    }
  });

  // Logs
  app.get("/device/logs/:enrollId", async (req, res) => {
    const { enrollId } = req.params;
    try {
      const result = await pool.query(
        `SELECT l.action, l.timestamp, u.username FROM device_logs l LEFT JOIN users u ON l.user_id = u.id WHERE l.enrollId = $1 ORDER BY l.timestamp DESC`,
        [enrollId]
      );
      res.status(200).json({ message: "✅ Logs fetched", logs: result.rows });
    } catch (error) {
      console.error("❌ Error in /device/logs:", error.message);
      res.status(500).json({ error: "Error fetching logs" });
    }
  });

  // Reset Tables
  app.post("/reset-tables", verifyToken, async (req, res) => {
    const { adminSecret } = req.body;
    if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: "Invalid admin secret" });
    try {
      await pool.query(`DROP TABLE IF EXISTS device_logs, data, users`);
      await initializeTables();
      res.status(200).json({ message: "✅ Tables reset" });
    } catch (error) {
      console.error("❌ Error in /reset-tables:", error.message);
      res.status(500).json({ error: "Error resetting tables" });
    }
  });

  // Delete Data Table - Added adminSecret
  app.post("/delete-data-table", verifyToken, async (req, res) => {
    const { adminSecret } = req.body;
    if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: "Invalid admin secret" });
    try {
      await pool.query(`DROP TABLE IF EXISTS device_logs`);
      await pool.query(`DROP TABLE IF EXISTS data`);
      res.status(200).json({ message: "✅ Data tables deleted" });
    } catch (error) {
      console.error("❌ Error in /delete-data-table:", error.message);
      res.status(500).json({ error: "Error deleting tables" });
    }
  });

  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}

startServer().catch(err => {
  console.error("❌ Error starting server:", err);
  process.exit(1);
});

process.on("unhandledRejection", (error) => console.error("❌ Unhandled Rejection:", error.message));