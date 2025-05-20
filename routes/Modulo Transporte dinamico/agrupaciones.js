import cron from 'node-cron';
import express from 'express';
import { agruparSolicitudesPorPMCP } from '../../workers/bk002_01_groupRequests.js';
import { generateCombinations } from '../../workers/bk002_02_generateCombinations.js';

const router = express.Router();


async function nuevo_grupo(pool){
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
      if(await nuevo_grupo(pool)){
        await generateCombinations(pool);
      }
      res.status(200).json({ message: "Agrupación y combinacion completada con éxito."});
    } catch (error) {
      res.status(500).json({ message: "Error al agrupar solicitudes." });
    }
  });

    // Scheduler para correr la función automáticamente cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('Ejecutando agrupación automática cada 15 minutos...');
      await agruparSolicitudesPorPMCP(pool);
   if(await nuevo_grupo(pool)){
        await generateCombinations(pool);
      }
      console.log('Agrupación automática completada.');
    } catch (error) {
      console.error('Error en la agrupación automática:', error);
    }
  });

  return router;
};