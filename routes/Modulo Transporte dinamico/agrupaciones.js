import cron from 'node-cron';
import express from 'express';
import { agruparSolicitudesPorPMCP } from '../../workers/bk002_01_groupRequests.js';

const router = express.Router();

export default (pool) => {
  // Endpoint para agrupar solicitudes
  router.post('/agrupar-solicitudes', async (req, res) => {
    try {
      await agruparSolicitudesPorPMCP(pool);
      res.status(200).json({ message: "Agrupación completada con éxito." });
    } catch (error) {
      res.status(500).json({ message: "Error al agrupar solicitudes." });
    }
  });

    // Scheduler para correr la función automáticamente cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('Ejecutando agrupación automática cada 15 minutos...');
      await agruparSolicitudesPorPMCP(pool);
      console.log('Agrupación automática completada.');
    } catch (error) {
      console.error('Error en la agrupación automática:', error);
    }
  });

  return router;
};