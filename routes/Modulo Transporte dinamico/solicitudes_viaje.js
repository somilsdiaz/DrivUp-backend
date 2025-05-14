import express from "express";
import { calcularDistancia } from "../../workers/geocoding.js";
import { calcularInfoViaje } from "../../workers/calculos_viaje.js";

const router = express.Router();

export default function solicitudesViajeRoutes(pool) {
    /**
     * endpoint para crear una nueva solicitud de viaje
     * registra petición de un pasajero para transporte entre dos puntos
     */
    router.post("/solicitudes-viaje", async (req, res) => {
        const {
            pasajero_id,
            origen_lat,
            origen_lon,
            destino_lat,
            destino_lon,
            es_origen_concentracion,
            origen_pmcp_id,
            es_destino_concentracion,
            destino_pmcp_id
        } = req.body;

        // verificamos que estén presentes todos los datos básicos necesarios
        if (!pasajero_id || !origen_lat || !origen_lon || !destino_lat || !destino_lon) {
            return res.status(400).json({
                success: false,
                message: "Faltan campos obligatorios: pasajero_id, origen_lat, origen_lon, destino_lat, destino_lon."
            });
        }

        // validamos que origen y destino no sean el mismo punto de concentración
        if (es_origen_concentracion && es_destino_concentracion && origen_pmcp_id === destino_pmcp_id) {
            return res.status(400).json({
                success: false,
                message: "El punto de origen y destino no pueden ser el mismo punto de concentración."
            });
        }

        try {
            // convertimos coordenadas a números para cálculos
            const origenLat = parseFloat(origen_lat);
            const origenLon = parseFloat(origen_lon);
            const destinoLat = parseFloat(destino_lat);
            const destinoLon = parseFloat(destino_lon);

            // verificamos que las coordenadas sean valores numéricos válidos
            if (
                isNaN(origenLat) || isNaN(origenLon) || 
                isNaN(destinoLat) || isNaN(destinoLon)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Las coordenadas deben ser valores numéricos válidos."
                });
            }
            
            // calculamos la distancia entre origen y destino usando la función de haversine
            const distancia = calcularDistancia(origenLat, origenLon, destinoLat, destinoLon);
            
            // rechazamos la solicitud si la distancia es menor a 100 metros
            if (distancia < 100) {
                return res.status(400).json({
                    success: false,
                    message: "El origen y destino están demasiado cerca (menos de 100 metros). Deben ser lugares diferentes."
                });
            }

            // verificación adicional para puntos de concentración
            // caso 1: si el origen es un punto de concentración, verificamos que el destino no esté en el mismo punto
            if (es_origen_concentracion && origen_pmcp_id) {
                // obtenemos la información del punto de concentración de origen
                const puntoConcResult = await pool.query(
                    "SELECT id, latitud, longitud FROM puntos_concentracion WHERE id = $1",
                    [origen_pmcp_id]
                );
                
                if (puntoConcResult.rows.length > 0) {
                    const puntoConc = puntoConcResult.rows[0];
                    
                    // verificamos si el destino está cerca del punto de concentración de origen
                    const queryDestinoCerca = `
                        SELECT 1 FROM puntos_concentracion 
                        WHERE id = $1
                        AND ST_DWithin(
                            ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography,
                            100
                        )
                    `;
                    
                    const destinoCercaResult = await pool.query(
                        queryDestinoCerca, 
                        [origen_pmcp_id, destinoLat, destinoLon]
                    );
                    
                    if (destinoCercaResult.rows.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: "El destino está demasiado cerca del punto de concentración de origen."
                        });
                    }
                }
            }
            
            // caso 2: si el destino es un punto de concentración, verificamos que el origen no esté en el mismo punto
            if (es_destino_concentracion && destino_pmcp_id) {
                // obtenemos la información del punto de concentración de destino
                const puntoConcResult = await pool.query(
                    "SELECT id, latitud, longitud FROM puntos_concentracion WHERE id = $1",
                    [destino_pmcp_id]
                );
                
                if (puntoConcResult.rows.length > 0) {
                    const puntoConc = puntoConcResult.rows[0];
                    
                    // verificamos si el origen está cerca del punto de concentración de destino
                    const queryOrigenCerca = `
                        SELECT 1 FROM puntos_concentracion 
                        WHERE id = $1
                        AND ST_DWithin(
                            ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography,
                            100
                        )
                    `;
                    
                    const origenCercaResult = await pool.query(
                        queryOrigenCerca, 
                        [destino_pmcp_id, origenLat, origenLon]
                    );
                    
                    if (origenCercaResult.rows.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: "El origen está demasiado cerca del punto de concentración de destino."
                        });
                    }
                }
            }

            // regla de negocio: al menos un extremo del viaje debe ser punto de concentración
            if ((!es_origen_concentracion || !origen_pmcp_id) && (!es_destino_concentracion || !destino_pmcp_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Al menos un punto (origen o destino) debe ser un punto de concentración."
                });
            }

            // verificamos coherencia entre bandera y id para el origen
            if ((es_origen_concentracion && !origen_pmcp_id) || (!es_origen_concentracion && origen_pmcp_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Inconsistencia en el origen: si es_origen_concentracion es true, debe proporcionar origen_pmcp_id."
                });
            }

            // verificamos coherencia entre bandera y id para el destino
            if ((es_destino_concentracion && !destino_pmcp_id) || (!es_destino_concentracion && destino_pmcp_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Inconsistencia en el destino: si es_destino_concentracion es true, debe proporcionar destino_pmcp_id."
                });
            }

            // comprobamos que el pasajero exista en la base de datos
            const pasajeroResult = await pool.query(
                "SELECT id FROM usuarios WHERE id = $1",
                [pasajero_id]
            );

            if (pasajeroResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "El pasajero especificado no existe."
                });
            }

            // verificamos que el pasajero no tenga ya una solicitud en espera
            const solicitudPendienteQuery = `
                SELECT id FROM solicitudes_viaje 
                WHERE pasajero_id = $1 
                AND estado = 'pendiente'
            `;
            
            const solicitudPendienteResult = await pool.query(solicitudPendienteQuery, [pasajero_id]);
            
            if (solicitudPendienteResult.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Ya tienes una solicitud de viaje pendiente. No puedes crear otra hasta que se complete o canceles la existente.",
                    solicitudPendienteId: solicitudPendienteResult.rows[0].id
                });
            }

            // verificamos que el punto de concentración de origen exista (si aplica)
            if (origen_pmcp_id) {
                const origenPmcpResult = await pool.query(
                    "SELECT id FROM puntos_concentracion WHERE id = $1",
                    [origen_pmcp_id]
                );

                if (origenPmcpResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "El punto de concentración de origen especificado no existe."
                    });
                }
            }

            // verificamos que el punto de concentración de destino exista (si aplica)
            if (destino_pmcp_id) {
                const destinoPmcpResult = await pool.query(
                    "SELECT id FROM puntos_concentracion WHERE id = $1",
                    [destino_pmcp_id]
                );

                if (destinoPmcpResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "El punto de concentración de destino especificado no existe."
                    });
                }
            }

            // insertamos la nueva solicitud en la base de datos
            const query = `
                INSERT INTO solicitudes_viaje (
                    pasajero_id,
                    origen_lat,
                    origen_lon,
                    destino_lat,
                    destino_lon,
                    es_origen_concentracion,
                    origen_pmcp_id,
                    es_destino_concentracion,
                    destino_pmcp_id,
                    estado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
                RETURNING *
            `;

            const values = [
                pasajero_id,
                origen_lat,
                origen_lon,
                destino_lat,
                destino_lon,
                es_origen_concentracion || false,
                origen_pmcp_id || null,
                es_destino_concentracion || false,
                destino_pmcp_id || null
            ];

            const result = await pool.query(query, values);

            res.status(201).json({
                success: true,
                message: "Solicitud de viaje creada exitosamente.",
                solicitud: result.rows[0]
            });
        } catch (error) {
            console.error("Error al crear solicitud de viaje:", error);
            res.status(500).json({
                success: false,
                message: "Error interno al crear la solicitud de viaje.",
                error: error.message
            });
        }
    });

    /**
     * endpoint para calcular información de un viaje potencial
     * retorna distancia exacta, tiempo estimado y rango de costos
     */
    router.post("/calcular-info-viaje", async (req, res) => {
        const {
            origen_lat,
            origen_lon,
            destino_lat,
            destino_lon,
            es_origen_concentracion,
            es_destino_concentracion,
            num_pasajeros
        } = req.body;

        // verificamos que estén presentes todos los datos básicos necesarios
        if (!origen_lat || !origen_lon || !destino_lat || !destino_lon) {
            return res.status(400).json({
                success: false,
                message: "Faltan campos obligatorios: origen_lat, origen_lon, destino_lat, destino_lon."
            });
        }

        try {
            // convertimos coordenadas a números para cálculos
            const origenLat = parseFloat(origen_lat);
            const origenLon = parseFloat(origen_lon);
            const destinoLat = parseFloat(destino_lat);
            const destinoLon = parseFloat(destino_lon);
            
            // verificamos que las coordenadas sean valores numéricos válidos
            if (
                isNaN(origenLat) || isNaN(origenLon) || 
                isNaN(destinoLat) || isNaN(destinoLon)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Las coordenadas deben ser valores numéricos válidos."
                });
            }
            
            // calculamos la distancia entre origen y destino
            const distanciaMetros = calcularDistancia(origenLat, origenLon, destinoLat, destinoLon);
            
            // rechazamos la solicitud si la distancia es menor a 100 metros
            if (distanciaMetros < 100) {
                return res.status(400).json({
                    success: false,
                    message: "El origen y destino están demasiado cerca (menos de 100 metros). Deben ser lugares diferentes."
                });
            }

            let resultado;
            
            // Si se especifica un número exacto de pasajeros
            if (num_pasajeros) {
                const numPasajeros = parseInt(num_pasajeros);
                
                if (isNaN(numPasajeros) || numPasajeros < 1 || numPasajeros > 5) {
                    return res.status(400).json({
                        success: false,
                        message: "El número de pasajeros debe ser un valor numérico entre 1 y 5."
                    });
                }
                
                // Calculamos la información para el número específico de pasajeros
                const infoViaje = calcularInfoViaje(
                    origenLat,
                    origenLon,
                    destinoLat,
                    destinoLon,
                    es_origen_concentracion || false,
                    es_destino_concentracion || false,
                    numPasajeros
                );
                
                resultado = {
                    info_viaje: infoViaje
                };
            } else {
                // Si no se especifica un número de pasajeros, calculamos para 3, 4 y 5 pasajeros
                const infoViaje3 = calcularInfoViaje(
                    origenLat,
                    origenLon,
                    destinoLat,
                    destinoLon,
                    es_origen_concentracion || false,
                    es_destino_concentracion || false,
                    3
                );
                
                const infoViaje4 = calcularInfoViaje(
                    origenLat,
                    origenLon,
                    destinoLat,
                    destinoLon,
                    es_origen_concentracion || false,
                    es_destino_concentracion || false,
                    4
                );
                
                const infoViaje5 = calcularInfoViaje(
                    origenLat,
                    origenLon,
                    destinoLat,
                    destinoLon,
                    es_origen_concentracion || false,
                    es_destino_concentracion || false,
                    5
                );
                
                resultado = {
                    info_viaje: infoViaje4, // Mantener compatibilidad con versiones anteriores (4 pasajeros como default)
                    escenarios: {
                        pasajeros_3: infoViaje3,
                        pasajeros_4: infoViaje4,
                        pasajeros_5: infoViaje5
                    },
                    mensaje_escenarios: "Se proporcionan distintos escenarios para 3, 4 y 5 pasajeros ya que no se especificó el número exacto."
                };
            }

            res.status(200).json({
                success: true,
                message: "Información de viaje calculada correctamente.",
                ...resultado
            });
        } catch (error) {
            console.error("Error al calcular información del viaje:", error);
            res.status(500).json({
                success: false,
                message: "Error interno al calcular la información del viaje.",
                error: error.message
            });
        }
    });

    return router;
} 