import express from 'express';

/**
 * endpoint conductor aceptar viaje
 */
export default function aceptarViajeRoutes(pool) {
    const router = express.Router();

    // endpoint para aceptar un viaje
    router.post('/aceptar-viaje', async (req, res) => {
        const { viaje_id, user_id } = req.body;

        // verificar que se recibieron los parámetros requeridos
        if (!viaje_id || !user_id) {
            return res.status(400).json({ 
                error: 'Información incompleta', 
                mensaje: 'No se pudo procesar su solicitud porque faltan datos necesarios. Por favor, inténtelo de nuevo o contacte a soporte técnico.'
            });
        }

        const client = await pool.connect();
        try {
            // iniciar transacción
            await client.query('BEGIN');

            // obtener el conductor_id a partir del user_id
            const conductorResult = await client.query(
                'SELECT id FROM conductores WHERE user_id = $1',
                [user_id]
            );

            if (conductorResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ 
                    error: 'Perfil de conductor no encontrado', 
                    mensaje: 'Su cuenta de usuario no está asociada a un perfil de conductor. Para aceptar viajes, complete su registro como conductor primero.'
                });
            }

            const conductor_id = conductorResult.rows[0].id;
            
            // verificar que el conductor esté disponible en conductores_activos_disponibles
            const conductorDisponibleResult = await client.query(
                `SELECT estado_disponibilidad_viaje FROM conductores_activos_disponibles 
                 WHERE conductor_id = $1`,
                [conductor_id]
            );

            if (conductorDisponibleResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'Sesión de conductor inactiva', 
                    mensaje: 'Para aceptar viajes, primero debe activar su disponibilidad como conductor en la aplicación.'
                });
            }

            const estadoDisponibilidad = conductorDisponibleResult.rows[0].estado_disponibilidad_viaje;
            
            if (estadoDisponibilidad !== 'disponible') {
                await client.query('ROLLBACK');
                
                let mensajePersonalizado = '';
                if (estadoDisponibilidad === 'ofrecido_viaje') {
                    mensajePersonalizado = 'Actualmente tiene una oferta de viaje pendiente. Complete o rechace ese proceso antes de aceptar un nuevo viaje.';
                } else if (estadoDisponibilidad === 'en_viaje_asignado') {
                    mensajePersonalizado = 'Ya tiene un viaje en progreso. Debe completar su viaje actual antes de aceptar uno nuevo.';
                } else {
                    mensajePersonalizado = `Su estado actual (${estadoDisponibilidad}) no le permite aceptar viajes en este momento.`;
                }
                
                return res.status(400).json({ 
                    error: 'No disponible para aceptar viajes', 
                    mensaje: mensajePersonalizado,
                    estado_actual: estadoDisponibilidad 
                });
            }

            // verificar que el viaje existe y está disponible
            const viajeResult = await client.query(
                'SELECT * FROM viajes WHERE id = $1 AND estado = $2',
                [viaje_id, 'disponible']
            );

            if (viajeResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ 
                    error: 'Viaje no disponible', 
                    mensaje: 'Este viaje ya no está disponible. Puede que otro conductor lo haya aceptado o haya sido cancelado. Por favor, actualice su lista de viajes disponibles.'
                });
            }

            // actualizar el viaje: asignar conductor y cambiar estado
            await client.query(
                'UPDATE viajes SET conductor_id = $1, estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [conductor_id, 'aceptado_conductor', viaje_id]
            );

            // actualizar el estado del conductor en conductores_activos_disponibles a "en_viaje_asignado"
            const actualizarConductorResult = await client.query(
                `UPDATE conductores_activos_disponibles 
                 SET estado_disponibilidad_viaje = 'en_viaje_asignado', updated_at = CURRENT_TIMESTAMP 
                 WHERE conductor_id = $1
                 RETURNING *`,
                [conductor_id]
            );

            // si el conductor no está en la tabla de conductores activos, registrar advertencia pero continuar
            if (actualizarConductorResult.rows.length === 0) {
                console.warn(`Conductor ID ${conductor_id} no se encuentra en la tabla conductores_activos_disponibles`);
            }

            // obtener todas las solicitudes de viaje asociadas al viaje
            const solicitudesResult = await client.query(
                'SELECT solicitud_viaje_id FROM viaje_pasajeros WHERE viaje_id = $1',
                [viaje_id]
            );

            // actualizar el estado de todas las solicitudes asociadas a "aceptado"
            const solicitudesIds = solicitudesResult.rows.map(row => row.solicitud_viaje_id);
            
            if (solicitudesIds.length > 0) {
                await client.query(
                    `UPDATE solicitudes_viaje 
                     SET estado = 'aceptado', updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ANY($1)`,
                    [solicitudesIds]
                );
            }

            // confirmar
            await client.query('COMMIT');

            res.status(200).json({ 
                message: '¡Viaje aceptado correctamente! Los pasajeros han sido notificados y están esperando su llegada.',
                viaje_id: viaje_id,
                conductor_id: conductor_id,
                user_id: user_id,
                conductor_status_updated: actualizarConductorResult.rows.length > 0,
                solicitudes_actualizadas: solicitudesIds.length
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al aceptar el viaje:', error);
            res.status(500).json({ 
                error: 'Error en el sistema', 
                mensaje: 'Ha ocurrido un problema al procesar su solicitud. Por favor, inténtelo nuevamente en unos momentos. Si el problema persiste, contacte a soporte técnico.'
            });
        } finally {
            client.release();
        }
    });

    // endpoint para obtener detalles de un viaje aceptado por un conductor
    router.get('/detalles-viaje-conductor', async (req, res) => {
        const { user_id } = req.query;

        if (!user_id) {
            return res.status(400).json({
                error: 'Información incompleta',
                mensaje: 'Se requiere el ID del usuario para obtener los detalles del viaje.'
            });
        }

        const client = await pool.connect();
        try {
            // 1. Obtener el conductor_id a partir del user_id
            const conductorResult = await client.query(
                'SELECT id FROM conductores WHERE user_id = $1',
                [user_id]
            );

            if (conductorResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Perfil de conductor no encontrado',
                    mensaje: 'No se encontró un perfil de conductor asociado a este usuario.'
                });
            }

            const conductor_id = conductorResult.rows[0].id;

            // 2. Buscar el viaje activo del conductor (estado = 'aceptado_conductor')
            const viajeResult = await client.query(`
                SELECT 
                    v.id, 
                    v.punto_concentracion_id, 
                    p.nombre AS punto_concentracion_nombre,
                    p.latitud AS punto_concentracion_lat,
                    p.longitud AS punto_concentracion_lon,
                    v.pmcp_es_origen, 
                    v.distancia_km, 
                    v.tiempo_estimado_min, 
                    v.ganancia_estimada_conductor, 
                    v.numero_pasajeros_total,
                    v.estado
                FROM viajes v
                JOIN puntos_concentracion p ON v.punto_concentracion_id = p.id
                WHERE v.conductor_id = $1 AND v.estado = 'aceptado_conductor'
                ORDER BY v.updated_at DESC
                LIMIT 1
            `, [conductor_id]);

            if (viajeResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Viaje no encontrado',
                    mensaje: 'No se encontró un viaje activo aceptado para este conductor.'
                });
            }

            const viajeInfo = viajeResult.rows[0];
            const viaje_id = viajeInfo.id;

            // 3. Obtener información de los pasajeros asociados al viaje
            const pasajerosResult = await client.query(`
                SELECT 
                    u.id AS pasajero_id,
                    u.name, 
                    u.second_name, 
                    u.last_name, 
                    u.second_last_name,
                    u.phone_number,
                    sv.origen_lat,
                    sv.origen_lon,
                    sv.destino_lat,
                    sv.destino_lon,
                    vp.orden_recogida,
                    vp.orden_entrega,
                    vp.tarifa_pasajero
                FROM viaje_pasajeros vp
                JOIN solicitudes_viaje sv ON vp.solicitud_viaje_id = sv.id
                JOIN usuarios u ON sv.pasajero_id = u.id
                WHERE vp.viaje_id = $1
                ORDER BY vp.orden_recogida
            `, [viaje_id]);

            // 4. Construir la respuesta
            const respuesta = {
                viaje: {
                    id: viajeInfo.id,
                    punto_concentracion: {
                        id: viajeInfo.punto_concentracion_id,
                        nombre: viajeInfo.punto_concentracion_nombre,
                        latitud: viajeInfo.punto_concentracion_lat,
                        longitud: viajeInfo.punto_concentracion_lon
                    },
                    pmcp_es_origen: viajeInfo.pmcp_es_origen,
                    distancia_km: viajeInfo.distancia_km,
                    tiempo_estimado_min: viajeInfo.tiempo_estimado_min,
                    ganancia_estimada_conductor: viajeInfo.ganancia_estimada_conductor,
                    numero_pasajeros_total: viajeInfo.numero_pasajeros_total,
                    estado: viajeInfo.estado
                },
                pasajeros: pasajerosResult.rows.map(pasajero => ({
                    id: pasajero.pasajero_id,
                    nombre_completo: `${pasajero.name} ${pasajero.second_name || ''} ${pasajero.last_name} ${pasajero.second_last_name}`.trim().replace(/\s+/g, ' '),
                    nombre: pasajero.name,
                    segundo_nombre: pasajero.second_name,
                    apellido: pasajero.last_name,
                    segundo_apellido: pasajero.second_last_name,
                    telefono: pasajero.phone_number,
                    origen: {
                        latitud: pasajero.origen_lat,
                        longitud: pasajero.origen_lon
                    },
                    destino: {
                        latitud: pasajero.destino_lat,
                        longitud: pasajero.destino_lon
                    },
                    orden_recogida: pasajero.orden_recogida,
                    orden_entrega: pasajero.orden_entrega,
                    tarifa: pasajero.tarifa_pasajero
                }))
            };

            res.status(200).json(respuesta);
        } catch (error) {
            console.error('Error al obtener detalles del viaje:', error);
            res.status(500).json({
                error: 'Error en el sistema',
                mensaje: 'Ha ocurrido un problema al procesar su solicitud. Por favor, inténtelo nuevamente en unos momentos.'
            });
        } finally {
            client.release();
        }
    });

    return router;
}
