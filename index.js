import { pool, testConnection } from "./db.js";
import express from "express";
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
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
    const dataTableName = "data";
    const logsTableName = "device_logs";

    const checkUsersTable = await pool.query(
      `SELECT to_regclass($1)::text AS exists`,
      [`public.users`]
    );
    if (!checkUsersTable.rows[0].exists) {
      await pool.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Tabla 'users' creada");
    }

    const checkDataTable = await pool.query(
      `SELECT to_regclass($1)::text AS exists`,
      [`public.${dataTableName}`]
    );
    if (!checkDataTable.rows[0].exists) {
      await pool.query(`
        CREATE TABLE data (
          id SERIAL PRIMARY KEY,
          deviceName VARCHAR(100) NOT NULL,
          enrollId VARCHAR(20) NOT NULL UNIQUE,
          value TIMESTAMP NOT NULL,
          device_status BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Tabla 'data' creada");
    }

    const checkLogsTable = await pool.query(
      `SELECT to_regclass($1)::text AS exists`,
      [`public.${logsTableName}`]
    );
    if (!checkLogsTable.rows[0].exists) {
      await pool.query(`
        CREATE TABLE device_logs (
          id SERIAL PRIMARY KEY,
          enrollId VARCHAR(20) NOT NULL,
          action VARCHAR(10) NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_id INTEGER REFERENCES users(id),
          FOREIGN KEY (enrollId) REFERENCES data(enrollId) ON DELETE CASCADE
        )
      `);
      console.log("✅ Tabla 'device_logs' creada");
    }

    await pool.query(`
      ALTER TABLE device_logs
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
    `);
    console.log("✅ Tablas inicializadas exitosamente");
  } catch (error) {
    console.error("❌ Error inicializando tablas:", error.message);
    throw error;
  }
}

async function startServer() {
  const connected = await testConnection();
  if (!connected) {
    console.error("❌ No se puede iniciar server sin conexión a DB");
    process.exit(1);
  }
  await initializeTables();

app.post("/delete-data-table", verifyToken, async (req, res) => {
  try {
    // Drop tables in reverse order to handle foreign key dependencies
    await pool.query(`DROP TABLE IF EXISTS device_logs`);
    await pool.query(`DROP TABLE IF EXISTS data`);
    await pool.query(`DROP TABLE IF EXISTS users`);

    return res.status(200).json({ message: "✅ Tablas eliminadas exitosamente" });
  } catch (error) {
    console.error("❌ Error in /delete-data-table:", {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Error al eliminar las tablas" });
  }
});

app.post("/save-data", verifyToken, async (req, res) => {
  const { deviceName, enrollId, value } = req.body;

  if (!deviceName?.trim() || !enrollId?.trim() || !value?.trim()) {
    console.error("❌ Missing fields in /save-data:", { deviceName, enrollId, value });
    return res.status(400).json({ error: "Los campos 'deviceName', 'enrollId' y 'value' son requeridos" });
  }

  if (deviceName.trim().length > 100 || !/^[A-Za-z\s]{1,100}$/.test(deviceName.trim())) {
    return res.status(400).json({ error: "Nombre inválido" });
  }

  if (enrollId.trim().length > 20 || !/^[A-Za-z0-9]{1,20}$/.test(enrollId.trim())) {
    return res.status(400).json({ error: "Matrícula inválida" });
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return res.status(400).json({ error: "Formato de timestamp inválido" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO data (deviceName, enrollId, value) VALUES ($1, $2, $3) RETURNING *`,
      [deviceName.trim(), enrollId.trim(), value]
    );

    await pool.query(
      `INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`,
      [enrollId.trim(), 'REGISTER', req.user.id]
    );

    return res.status(201).json({
      message: "✅ Datos guardados exitosamente",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Error in /save-data:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    return res.status(500).json({ error: "Error al guardar los datos" });
  }
});

app.get("/get-data", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.username AS registered_by 
       FROM data d 
       LEFT JOIN device_logs l ON d.enrollId = l.enrollId AND l.action = 'REGISTER'
       LEFT JOIN users u ON l.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    return res.status(200).json({
      message: "✅ Datos obtenidos exitosamente",
      data: result.rows
    });
  } catch (error) {
    console.error("❌ Error in /get-data:", {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ error: "Error al obtener los datos" });
  }
});

app.post("/user/signup", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email`,
      [username.trim(), email.trim(), hashedPassword]
    );
    return res.status(201).json({ message: "User registered", user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("❌ Error in /user/signup:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    return res.status(500).json({ error: "Error registering user" });
  }
});

app.post("/user/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.trim()]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    return res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    console.error("❌ Error in /user/login:", {
      message: error.message,
      stack: error.stack,
      requestBody: { email }
    });
    return res.status(500).json({ error: "Error logging in" });
  }
});

app.post("/device/turn-on", async (req, res) => {
  const { enrollId } = req.body;

  if (!enrollId?.trim()) {
    return res.status(400).json({ error: "El campo 'enrollId' es requerido" });
  }

  try {
    const result = await pool.query(
      `UPDATE data SET device_status = TRUE WHERE enrollId = $1 RETURNING *`,
      [enrollId.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    await pool.query(
      `INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`,
      [enrollId.trim(), 'TURN_ON', req.user.id]
    );

    return res.status(200).json({
      message: "✅ Dispositivo encendido exitosamente",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Error in /device/turn-on:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    return res.status(500).json({ error: "Error al encender el dispositivo" });
  }
});

app.post("/device/turn-off", async (req, res) => {
  const { enrollId } = req.body;

  if (!enrollId?.trim()) {
    return res.status(400).json({ error: "El campo 'enrollId' es requerido" });
  }

  try {
    const result = await pool.query(
      `UPDATE data SET device_status = FALSE WHERE enrollId = $1 RETURNING *`,
      [enrollId.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    await pool.query(
      `INSERT INTO device_logs (enrollId, action, user_id) VALUES ($1, $2, $3)`,
      [enrollId.trim(), 'TURN_OFF', req.user.id]
    );

    return res.status(200).json({
      message: "✅ Dispositivo apagado exitosamente",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Error in /device/turn-off:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    return res.status(500).json({ error: "Error al apagar el dispositivo" });
  }
});

app.get("/device/status/:enrollId", async (req, res) => {
  const { enrollId } = req.params;

  try {
    const result = await pool.query(
      `SELECT device_status FROM data WHERE enrollId = $1`,
      [enrollId]
    );

    if (result.rowCount === 0) {
      console.error("❌ Device not found for enrollId:", enrollId);
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    return res.status(200).json({
      message: "✅ Estado del dispositivo obtenido exitosamente",
      device_status: result.rows[0].device_status
    });
  } catch (error) {
    console.error("❌ Error in /device/status:", {
      message: error.message,
      stack: error.stack,
      enrollId
    });
    return res.status(500).json({ error: "Error al obtener el estado del dispositivo" });
  }
});

app.get("/device/logs/:enrollId", verifyToken, async (req, res) => {
  const { enrollId } = req.params;
  try {
    const result = await pool.query(
      `SELECT l.action, l.timestamp, u.username 
       FROM device_logs l 
       LEFT JOIN users u ON l.user_id = u.id 
       WHERE l.enrollId = $1 ORDER BY l.timestamp DESC`,
      [enrollId]
    );
    return res.status(200).json({
      message: "✅ Logs obtenidos exitosamente",
      logs: result.rows
    });
  } catch (error) {
    console.error("❌ Error in /device/logs:", {
      message: error.message,
      stack: error.stack,
      enrollId
    });
    return res.status(500).json({ error: "Error al obtener los logs" });
  }
});

  app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("❌ Error iniciando server:", err);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error.message);
});