import express from "express";

const router = express.Router();

export default function detallesViajeRoutes(pool) {
  // Ruta para registrar un reseña
  

  router.get("/traerDatosViaje", async (req, res) => {
    const { id_viaje } = req.query; 
    try {
      const datos = await pool.query(`
   SELECT 
   vvp.id,
   CONCAT(svu.name, ' ', svu.last_name, ' ', svu.second_last_name) AS full_name,
   vvp.orden_recogida,
   vvp.orden_entrega,
   vvp.pmcp_es_origen
 FROM (
  SELECT 
    u.name,
    u.last_name,
    u.second_last_name,
    sv.id
  FROM solicitudes_viaje AS sv
  INNER JOIN usuarios AS u ON sv.pasajero_id = u.id
 ) AS svu
 INNER JOIN (
  SELECT 
    v.*, 
    vp.*
  FROM viajes AS v
  INNER JOIN viaje_pasajeros AS vp ON v.id = vp.viaje_id
  ) AS vvp ON svu.id = vvp.solicitud_viaje_id
  where vvp.id=${id_viaje};
            `);

      res.status(200).json(datos.rows);
    } catch (error) {
      console.error("Error al obtener los detalles del viaje:", error);
      res.status(500).json({ message: "Error interno al obtener los detalles del viaje" });
    }
  });

  return router;
}
