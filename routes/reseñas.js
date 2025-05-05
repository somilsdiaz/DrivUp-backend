import express from "express";

const router = express.Router();

export default function resenaRoutes(pool) {
  // Ruta para registrar un reseña
  router.post("/subirResena", async (req, res) => {
    const { conductor_id, pasajero_id, calificacion, comentario } = req.body;

    // Validar que todos los campos obligatorios estén presentes
    if (!conductor_id || !pasajero_id || !calificacion || !comentario) {
      return res
        .status(400)
        .json({ message: "Todos los campos obligatorios deben estar llenos." });
    }

    try {
      const query = `
                INSERT INTO reseñas (
                    conductor_id, pasajero_id, calificacion, comentario
                ) VALUES ($1, $2, $3, $4)
            `;

      const values = [conductor_id, pasajero_id, calificacion, comentario];

      await pool.query(query, values);

      res.status(201).json({ message: "Reseña registrada exitosamente." });
    } catch (error) {
      if (error.code === "23505") {
      }
      console.error("Error al registrar la reseña:", error);
      res.status(500).json({ message: "Error interno al registrar la reseña" });
    }
  });

  router.get("/traerResenas", async (req, res) => {
    const { conductor_id } = req.query; 
    try {
      const reseñas = await pool.query(`
                select u.id,u.name,u.last_name, r.reseña_id,r.calificacion,r.comentario,creado_en
                from usuarios as u inner join reseñas as r 
                on u.id=r.pasajero_id
                where r.conductor_id=${conductor_id}
                order by r.creado_en Desc
            `);

      res.status(200).json(reseñas.rows);
    } catch (error) {
      console.error("Error al obtener las reseñas:", error);
      res.status(500).json({ message: "Error interno al obtener las reseñas" });
    }
  });

  return router;
}
