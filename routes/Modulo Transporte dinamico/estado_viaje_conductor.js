import express from 'express';

export default function estadoViajeConductorRoutes(pool) {
    const router = express.Router();

    // Endpoint para obtener estado de pasajeros del viaje actual de un conductor
    router.get('/conductor/estado-viaje/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            
            // Obtener el conductor_id asociado al userId
            const conductorQuery = `
                SELECT id FROM conductores WHERE user_id = $1
            `;
            const conductorResult = await pool.query(conductorQuery, [userId]);
            
            if (conductorResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontró conductor asociado a este usuario' 
                });
            }
            
            const conductorId = conductorResult.rows[0].id;
            
            // Obtener el último viaje del conductor con estado "aceptado_conductor"
            const viajeQuery = `
                SELECT id 
                FROM viajes 
                WHERE conductor_id = $1 AND estado = 'aceptado_conductor'
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            const viajeResult = await pool.query(viajeQuery, [conductorId]);
            
            if (viajeResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontró un viaje actual para este conductor' 
                });
            }
            
            const viajeId = viajeResult.rows[0].id;
            
            // Obtener todas las solicitudes asociadas a este viaje
            const solicitudesQuery = `
                SELECT vp.solicitud_viaje_id
                FROM viaje_pasajeros vp
                WHERE vp.viaje_id = $1
            `;
            
            const solicitudesResult = await pool.query(solicitudesQuery, [viajeId]);
            
            if (solicitudesResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontraron pasajeros para este viaje' 
                });
            }
            
            // Crear array para almacenar los resultados de cada pasajero
            const resultados = [];
            
            // Para cada solicitud, obtener el estado y los datos del pasajero
            for (const solicitud of solicitudesResult.rows) {
                const solicitudId = solicitud.solicitud_viaje_id;
                
                const detalleQuery = `
                    SELECT 
                        sv.estado,
                        sv.pasajero_id,
                        u.name,
                        u.second_name,
                        u.last_name,
                        u.second_last_name
                    FROM solicitudes_viaje sv
                    JOIN usuarios u ON sv.pasajero_id = u.id
                    WHERE sv.id = $1
                `;
                
                const detalleResult = await pool.query(detalleQuery, [solicitudId]);
                
                if (detalleResult.rows.length > 0) {
                    const pasajero = detalleResult.rows[0];
                    const estadoFinal = pasajero.estado === 'completado_solicitud' ? 'completado' : 'no_completado';
                    
                    // Construir nombre completo del pasajero
                    const nombreCompleto = `${pasajero.name} ${pasajero.second_name || ''} ${pasajero.last_name} ${pasajero.second_last_name || ''}`.trim().replace(/\s+/g, ' ');
                    
                    resultados.push({
                        solicitud_id: solicitudId,
                        pasajero_id: pasajero.pasajero_id,
                        nombre_completo: nombreCompleto,
                        estado: estadoFinal
                    });
                }
            }
            
            return res.status(200).json({
                success: true,
                viaje_id: viajeId,
                conductor_id: conductorId,
                pasajeros: resultados
            });
            
        } catch (error) {
            console.error('Error al obtener estado de viaje del conductor:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor', 
                error: error.message 
            });
        }
    });

    // Endpoint para marcar un viaje como completado
    router.post('/conductor/completar-viaje/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            
            // Obtener el conductor_id asociado al userId
            const conductorQuery = `
                SELECT id FROM conductores WHERE user_id = $1
            `;
            const conductorResult = await pool.query(conductorQuery, [userId]);
            
            if (conductorResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontró conductor asociado a este usuario' 
                });
            }
            
            const conductorId = conductorResult.rows[0].id;
            
            // Obtener el último viaje del conductor con estado "aceptado_conductor"
            const viajeQuery = `
                SELECT id 
                FROM viajes 
                WHERE conductor_id = $1 AND estado = 'aceptado_conductor'
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            const viajeResult = await pool.query(viajeQuery, [conductorId]);
            
            if (viajeResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontró un viaje actual para este conductor' 
                });
            }
            
            const viajeId = viajeResult.rows[0].id;
            
            // Obtener todas las solicitudes asociadas a este viaje
            const solicitudesQuery = `
                SELECT vp.solicitud_viaje_id
                FROM viaje_pasajeros vp
                WHERE vp.viaje_id = $1
            `;
            
            const solicitudesResult = await pool.query(solicitudesQuery, [viajeId]);
            
            if (solicitudesResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No se encontraron pasajeros para este viaje' 
                });
            }
            
            // Verificar el estado de todas las solicitudes
            let todasCompletadas = true;
            const solicitudesPendientes = [];
            
            for (const solicitud of solicitudesResult.rows) {
                const solicitudId = solicitud.solicitud_viaje_id;
                
                const estadoQuery = `
                    SELECT id, estado, pasajero_id
                    FROM solicitudes_viaje
                    WHERE id = $1
                `;
                
                const estadoResult = await pool.query(estadoQuery, [solicitudId]);
                
                if (estadoResult.rows.length > 0) {
                    const estadoSolicitud = estadoResult.rows[0].estado;
                    
                    if (estadoSolicitud !== 'completado_solicitud') {
                        todasCompletadas = false;
                        solicitudesPendientes.push({
                            solicitud_id: solicitudId,
                            pasajero_id: estadoResult.rows[0].pasajero_id,
                            estado: estadoSolicitud
                        });
                    }
                }
            }
            
            // Si todas las solicitudes están completadas, actualizar el estado del viaje
            if (todasCompletadas) {
                const actualizarViajeQuery = `
                    UPDATE viajes
                    SET estado = 'completado_viaje', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING id
                `;
                
                const actualizarResult = await pool.query(actualizarViajeQuery, [viajeId]);
                
                if (actualizarResult.rows.length > 0) {
                    return res.status(200).json({
                        success: true,
                        message: 'Viaje marcado como completado',
                        viaje_id: viajeId
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        message: 'Error al actualizar el estado del viaje'
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede completar el viaje porque hay solicitudes pendientes',
                    solicitudes_pendientes: solicitudesPendientes,
                    viaje_id: viajeId
                });
            }
            
        } catch (error) {
            console.error('Error al completar viaje:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor', 
                error: error.message 
            });
        }
    });

    return router;
} 