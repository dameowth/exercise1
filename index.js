import pool from "./db.js";
import express from "express";
import cors from "cors";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
          nombre VARCHAR(100) NOT NULL,
          matricula VARCHAR(20) NOT NULL UNIQUE,
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
  const { nombre, matricula } = req.body;

  if (!nombre || !matricula) {
    return res.status(400).json({ error: "Los campos 'nombre' y 'matricula' son requeridos" });
  }

  if (nombre.length > 100 || !/^[A-Za-z\s]+$/.test(nombre)) {
    return res.status(400).json({ error: "Nombre inválido" });
  }

  if (matricula.length > 20 || !/^[A-Za-z0-9]+$/.test(matricula)) {
    return res.status(400).json({ error: "Matrícula inválida" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO data (nombre, matricula) VALUES ($1, $2) RETURNING *`,
      [nombre, matricula]
    );

    return res.status(201).json({
      message: "✅ Datos guardados exitosamente",
      data: result.rows[0],
    });
  } catch (error) {
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
      ADD COLUMN IF NOT EXISTS nombre VARCHAR(100) NOT NULL,
      ADD COLUMN IF NOT EXISTS matricula VARCHAR(20) NOT NULL UNIQUE
    `);

    return res.status(200).json({ message: "✅ Tabla modificada exitosamente" });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return res.status(500).json({ error: "Error al modificar la tabla" });
  }
});

app.post("/drop-data-table", async (req, res) => {
  try {
    const tableName = "data";
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
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error.message);
});