
import express from "express";

const router = express.Router();

export default function ruta_Usuario_Routes(pool) {
  // Ruta para registrar un reseña
  router.post("/crear-ruta-usuario", async (req, res) => {
    const { user_id,origen,destino,dias,hora,descripcion } = req.body;

    // Validar que todos los campos obligatorios estén presentes
    if (!user_id || !origen || !destino || !dias|| !hora || !descripcion) {
      return res
        .status(400)
        .json({ message: "Todos los campos obligatorios deben estar llenos." });
    }

    try {
      const query = `
                INSERT INTO ruta_usuario (
                   user_id, origen, destino, dias, hora, descripcion
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `;

      const values = [user_id, origen, destino, dias, hora, descripcion];

      await pool.query(query, values);

      res.status(201).json({ message: "Ruta registrada exitosamente." });
    } catch (error) {
      if (error.code === "23505") {
      }
      console.error("Error al registrar la ruta:", error);
      res.status(500).json({ message: "Error interno al registrar la ruta" });
    }
  });

  // Ruta para obtener todas las rutas de usuarios
router.get("/rutas-usuarios", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ruta_usuario");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener las rutas de usuarios:", error);
    res.status(500).json({ message: "Error interno al obtener las rutas" });
  }
});


  

  return router;
}
