import express from 'express';

const router = express.Router();

// router.get('/ruta-candidata/:grupoId', async (req, res) => {
//   const { grupoId } = req.params;

//   try {
//     const { rows: puntos } = await pool.query(
//       `SELECT latitud, longitud FROM ubicaciones_ruta WHERE grupo_candidato_id = $1 ORDER BY orden`,
//       [grupoId]
//     );

//     res.json({ puntos });
//   } catch (error) {
//     console.error('Error al obtener ruta:', error);
//     res.status(500).json({ message: 'Error al obtener ruta' });
//   }
// });

// ruta temporal en visualization.js
router.post('/ruta-ejemplo', (req, res) => {
  const rutaFalsa = {
    origen: { lat: 11.0194, lng: -74.8504 },
    destino: { lat: 10.9663, lng: -74.7760 },
    puntos_intermedios: [
      { lat: 11.0000, lng: -74.8200 },
      { lat: 10.9900, lng: -74.8000 }
    ]
  };

  res.json(rutaFalsa);
});

//curl -X POST http://localhost:5000/ruta-ejemplo

export default router;
