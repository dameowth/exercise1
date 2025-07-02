import pool from "./db.js";
import express from "express";
import cors from "cors";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: ['https://exercise1-g67a.onrender.com', 'http://localhost:3000'] }));
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
          name VARCHAR(100) NOT NULL,
          enrollId VARCHAR(20) NOT NULL UNIQUE,
          value TIMESTAMP NOT NULL,
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

app.post("/savedata", async (req, res) => {
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
      `INSERT INTO data (name, enrollId, value) VALUES ($1, $2, $3) RETURNING *`,
      [name, enrollId, value]
    );

    return res.status(201).json({
      message: "✅ Datos guardados exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: "Matrícula ya existe" });
    }
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al guardar los datos" });
  }
});

app.post("/alter-data-table", async (req, res) => {
  try {
    const tableName = "data";

    const checkTable = await pool.query(
      `SELECT to_regclass($1)::text AS exists`,
      [`public.${tableName}`]
    );

    if (!checkTable.rows[0].exists) {
      return res.status(404).json({ error: "La tabla no existe" });
    }

    await pool.query(`
      ALTER TABLE data
      ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL,
      ADD COLUMN IF NOT EXISTS enrollId VARCHAR(20) NOT NULL UNIQUE,
      ADD COLUMN IF NOT EXISTS value TIMESTAMP NOT NULL
    `);

    return res.status(200).json({ message: "✅ Tabla modificada exitosamente" });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al modificar la tabla" });
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

app.get("/temperatura", (req, res) => {
  res.json({ valor: "10 °C", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error.message);
});