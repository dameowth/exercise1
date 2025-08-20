import pool from "./db.js";
import express from "express";
import cors from "cors";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://exercise1-nt4i.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
    'https://frontend-p5su.onrender.com' // Render static site
  ]
}));
app.use(express.json());

app.post("/create-data-table", async (req, res) => {
  try {
    const tableName = "data";

    const checkTable = await pool.query(
      `SELECT to_regclass($1)::text AS exists`,
      [`public.${tableName}`]
    );

    if (!checkTable.rows[0].exists) {
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

      return res.status(201).json({ message: "✅ Tabla creada exitosamente" });
    }
    return res.status(200).json({ message: "ℹ La tabla ya existe" });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

app.post("/save-data", async (req, res) => {
  const { name, enrollId, value } = req.body;

  if (!name || !enrollId || !value) {
    return res.status(400).json({ error: "Los campos 'name', 'enrollId' y 'value' son requeridos" });
  }

  if (name.length > 100 || !/^[A-Za-z\s]+$/.test(name)) {
    return res.status(400).json({ error: "Nombre inválido" });
  }

  if (enrollId.length > 20 || !/^[A-Za-z0-9]+$/.test(enrollId)) {
    return res.status(400).json({ error: "Matrícula inválida" });
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return res.status(400).json({ error: "Formato de timestamp inválido" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO data (name, enrollId, value, device_status) 
       VALUES ($1, $2, $3, FALSE) 
       ON CONFLICT (enrollId) DO UPDATE SET name = EXCLUDED.name, value = EXCLUDED.value 
       RETURNING *`,
      [name, enrollId, value]
    );

    return res.status(201).json({
      message: "✅ Datos guardados/actualizados exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al guardar los datos" });
  }
});

app.post("/drop-data-table", async (req, res) => {
  try {
    await pool.query(`DROP TABLE IF EXISTS data`);
    return res.status(200).json({ message: "✅ Tabla eliminada exitosamente" });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al eliminar la tabla" });
  }
});

app.get("/getdata", async (req, res) => {
  const tableName = "data";
  try {
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    return res.status(200).json({ message: "✅ Datos obtenidos exitosamente", data: result.rows });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al obtener los datos" });
  }
});

// Endpoints para device
app.post("/device/turn-on", async (req, res) => {
  const { enrollId } = req.body;

  if (!enrollId) {
    return res.status(400).json({ error: "El campo 'enrollId' es requerido" });
  }

  try {
    const result = await pool.query(
      `UPDATE data SET device_status = TRUE WHERE enrollId = $1 RETURNING *`,
      [enrollId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    return res.status(200).json({
      message: "✅ Dispositivo encendido exitosamente",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al encender el dispositivo" });
  }
});

app.post("/device/turn-off", async (req, res) => {
  const { enrollId } = req.body;

  if (!enrollId) {
    return res.status(400).json({ error: "El campo 'enrollId' es requerido" });
  }

  try {
    const result = await pool.query(
      `UPDATE data SET device_status = FALSE WHERE enrollId = $1 RETURNING *`,
      [enrollId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    return res.status(200).json({
      message: "✅ Dispositivo apagado exitosamente",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
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
      return res.status(404).json({ error: "Dispositivo no encontrado" });
    }

    return res.status(200).json({
      message: "✅ Estado del dispositivo obtenido exitosamente",
      device_status: result.rows[0].device_status
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al obtener el estado del dispositivo" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error.message);
});