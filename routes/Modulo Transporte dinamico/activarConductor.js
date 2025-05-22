import express from "express";

const router = express.Router();

export default function activarConductor(pool) {

    /**
     * endpoint para activar un conductor y registrarlo como disponible
     * recibe el userid y la ubicacion actual del conductor
     * registra al conductor en la tabla conductores_activos_disponibles
     */
    router.post('/activar', async (req, res) => {
        try {
            const { userId, latitud, longitud } = req.body;
            if (!userId || !latitud || !longitud) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere el ID de usuario y la ubicación actual (latitud/longitud)'
                });
            }
            // buscar el id del conductor basado en el id de usuario
            const conductorResult = await pool.query(
                'SELECT id FROM conductores WHERE user_id = $1',
                [userId]
            );
            if (conductorResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No se encontró un conductor asociado a este usuario'
                });
            }
            const conductorId = conductorResult.rows[0].id;

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // usar zona horaria de colombia (america/bogota)
                await client.query(
                    `INSERT INTO conductores_activos_disponibles (
              conductor_id, 
              ubicacion_actual_lat, 
              ubicacion_actual_lon, 
              ultima_actualizacion_ubicacion, 
              sesion_expira_en, 
              estado_disponibilidad_viaje
            ) VALUES ($1, $2, $3, 
              CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota', 
              (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') + INTERVAL '1 hour', 
              'disponible')
            ON CONFLICT (conductor_id) 
            DO UPDATE SET 
              ubicacion_actual_lat = $2, 
              ubicacion_actual_lon = $3,
              ultima_actualizacion_ubicacion = CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota',
              sesion_expira_en = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota') + INTERVAL '1 hour',
              estado_disponibilidad_viaje = 'disponible',
              updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota'`,
                    [conductorId, latitud, longitud]
                );
                await client.query('COMMIT');

                // calcular fecha de expiracion en hora de colombia
                const now = new Date();
                const colombiaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
                const expiration = new Date(colombiaTime.getTime() + 3600000); // +1 hora

                return res.status(200).json({
                    success: true,
                    message: 'Conductor activado exitosamente',
                    data: {
                        conductorId,
                        estado: 'disponible',
                        sesionExpiraEn: expiration.toISOString(),
                        horaColombia: colombiaTime.toISOString()
                    }
                });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error al activar conductor:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor al activar el conductor',
                error: error.message
            });
        }
    });

    /**
     * endpoint para actualizar la ubicacion del conductor (heartbeat)
     * actualiza la ubicacion y renueva el tiempo de expiracion de la sesion
     */
    router.put('/actualizar-ubicacion', async (req, res) => {
        try {
            const { userId, latitud, longitud } = req.body;

            if (!userId || !latitud || !longitud) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere el ID de usuario y la ubicación actual (latitud/longitud)'
                });
            }

            // buscar el id del conductor basado en el id de usuario
            const conductorResult = await pool.query(
                'SELECT id FROM conductores WHERE user_id = $1',
                [userId]
            );

            if (conductorResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No se encontró un conductor asociado a este usuario'
                });
            }

            const conductorId = conductorResult.rows[0].id;

            // actualizar la ubicacion y renovar el tiempo de expiracion
            const updateResult = await pool.query(
                `UPDATE conductores_activos_disponibles
       SET ubicacion_actual_lat = $2,
           ubicacion_actual_lon = $3,
           ultima_actualizacion_ubicacion = CURRENT_TIMESTAMP,
           sesion_expira_en = NOW() + INTERVAL '1 hour',
           updated_at = CURRENT_TIMESTAMP
       WHERE conductor_id = $1
       RETURNING *`,
                [conductorId, latitud, longitud]
            );

            if (updateResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'El conductor no está activo actualmente'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Ubicación del conductor actualizada exitosamente',
                data: updateResult.rows[0]
            });

        } catch (error) {
            console.error('Error al actualizar ubicación del conductor:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor al actualizar ubicación',
                error: error.message
            });
        }
    });

    /**
     * endpoint para verificar si un conductor esta activo
     * recibe el userid y devuelve informacion sobre su estado de actividad
     */
    router.get('/verificar-estado/:userId', async (req, res) => {
        try {
            const { userId } = req.params;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere el ID de usuario'
                });
            }

            // paso 1: buscar el id del conductor basado en el id de usuario
            const conductorResult = await pool.query(
                'SELECT id FROM conductores WHERE user_id = $1',
                [userId]
            );

            if (conductorResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No se encontró un conductor asociado a este usuario'
                });
            }

            const conductorId = conductorResult.rows[0].id;

            // paso 2: verificar si el conductor esta activo en la tabla conductores_activos_disponibles
            const activoResult = await pool.query(
                `SELECT 
        cad.*,
        TO_CHAR(sesion_expira_en, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as sesion_expira_en_fmt
       FROM 
        conductores_activos_disponibles cad
       WHERE 
        conductor_id = $1`,
                [conductorId]
            );

            // responder con el estado del conductor
            if (activoResult.rows.length === 0) {
                return res.status(200).json({
                    success: true,
                    activo: false,
                    message: 'El conductor no está activo actualmente',
                    data: {
                        conductorId
                    }
                });
            } else {
                return res.status(200).json({
                    success: true,
                    activo: true,
                    message: 'El conductor está activo',
                    data: {
                        conductorId,
                        estadoDisponibilidad: activoResult.rows[0].estado_disponibilidad_viaje,
                        ubicacion: {
                            latitud: activoResult.rows[0].ubicacion_actual_lat,
                            longitud: activoResult.rows[0].ubicacion_actual_lon
                        },
                        ultimaActualizacion: activoResult.rows[0].ultima_actualizacion_ubicacion,
                        sesionExpiraEn: activoResult.rows[0].sesion_expira_en_fmt
                    }
                });
            }

        } catch (error) {
            console.error('Error al verificar estado del conductor:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor al verificar estado del conductor',
                error: error.message
            });
        }
    });

    return router;
}
