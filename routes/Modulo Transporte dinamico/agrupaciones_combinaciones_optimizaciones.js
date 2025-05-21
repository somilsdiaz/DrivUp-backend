import cron from 'node-cron';
import express from 'express';
import { agruparSolicitudesPorPMCP } from '../../workers/bk002_01_groupRequests.js';
import { generateCombinations } from '../../workers/bk002_02_generateCombinations.js';
import { optimizeRoutes } from '../../workers/bk002_03_optimizeTrips.js';

const router = express.Router();


async function nuevo_grupo(pool) {
  try {

    const data = await pool.query(`
      SELECT COUNT(*) > 0 AS hay_nuevo_grupo
FROM grupos_solicitudes_candidatos
WHERE estado_procesamiento = 'nuevo_grupo';
            `);
    return data.rows[0].hay_nuevo_grupo;
  } catch (error) {
    console.log("Error al obtener el dato:", error);
  }


}

export default (pool) => {
  // Endpoint para agrupar solicitudes
  router.post('/agrupar-solicitudes', async (req, res) => {
    try {

      await agruparSolicitudesPorPMCP(pool);
      if (await nuevo_grupo(pool)) {
        await generateCombinations(pool);
        await optimizeRoutes(pool);
      }
      res.status(200).json({ message: "Agrupación, combinación y optimización completadas con éxito." });
    } catch (error) {
      res.status(500).json({ message: "Error al procesar solicitudes." });
    }
  });

  // Scheduler para correr la función automáticamente cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('Ejecutando agrupación automática cada 15 minutos...');
      await agruparSolicitudesPorPMCP(pool);
      if (await nuevo_grupo(pool)) {
        await generateCombinations(pool);
        await optimizeRoutes(pool);
      }
      console.log('Proceso automático de agrupación completado.');
    } catch (error) {
      console.error('Error en el proceso automático:', error);
    }
  });

  return router;
};