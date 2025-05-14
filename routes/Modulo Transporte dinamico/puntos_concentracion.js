import express from "express";
import { geocodificarDireccion, reverseGeocodificar } from "../../workers/geocoding.js";

const router = express.Router();

export default function puntosConcentracionRoutes(pool) {
    /**
     * endpoint para verificar si una coordenada está en un punto de concentración
     * determina si una posición geográfica coincide con algún punto registrado
     */
    router.get("/verificar-punto-concentracion", async (req, res) => {
        const { lat, lon } = req.query;

        // validamos que se proporcionen las coordenadas necesarias
        if (!lat || !lon) {
            return res.status(400).json({
                message: "Se requieren los parámetros lat y lon (latitud y longitud)."
            });
        }

        try {
            // convertimos los parámetros a formato numérico
            const latitud = parseFloat(lat);
            const longitud = parseFloat(lon);

            // validamos que sean números válidos para coordenadas
            if (isNaN(latitud) || isNaN(longitud)) {
                return res.status(400).json({
                    message: "Los valores de latitud y longitud deben ser números válidos."
                });
            }

            // consulta espacial para encontrar puntos cercanos (radio 100m)
            // utilizamos funciones PostGIS para cálculos geoespaciales precisos
            const query = `
        SELECT id, nombre, latitud, longitud, descripcion, direccion_fisica
        FROM puntos_concentracion
        WHERE ST_DWithin(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography,
            100
        )
        ORDER BY ST_Distance(
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
            ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography
        )
        LIMIT 1;
        `;

            const result = await pool.query(query, [latitud, longitud]);

            if (result.rows.length > 0) {
                // retornamos el punto de concentración encontrado más cercano
                return res.status(200).json({
                    esPuntoConcentracion: true,
                    puntoConcentracion: result.rows[0]
                });
            } else {
                // no hay puntos de concentración cercanos
                return res.status(200).json({
                    esPuntoConcentracion: false
                });
            }
        } catch (error) {
            console.error("Error al verificar punto de concentración:", error);
            res.status(500).json({
                message: "Error interno al verificar el punto de concentración"
            });
        }
    });

    /**
     * endpoint para convertir coordenadas a dirección física
     * realiza geocodificación inversa para obtener dirección desde lat/lon
     */
    router.get("/coordenadas-a-direccion", async (req, res) => {
        const { lat, lon } = req.query;

        // validamos que se incluyan ambas coordenadas en la solicitud
        if (!lat || !lon) {
            return res.status(400).json({
                message: "Se requieren los parámetros lat y lon (latitud y longitud)."
            });
        }

        try {
            // convertimos a números y validamos formato
            const latitud = parseFloat(lat);
            const longitud = parseFloat(lon);

            // verificamos que sean valores numéricos válidos
            if (isNaN(latitud) || isNaN(longitud)) {
                return res.status(400).json({
                    message: "Los valores de latitud y longitud deben ser números válidos."
                });
            }

            // obtenemos la dirección usando el servicio de geocodificación inversa
            const direccionInfo = await reverseGeocodificar(latitud, longitud);

            if (direccionInfo) {
                // retornamos información completa de la dirección encontrada
                return res.status(200).json({
                    success: true,
                    coordenadas: {
                        lat: latitud,
                        lon: longitud
                    },
                    direccion: direccionInfo.direccion,
                    detallesDireccion: direccionInfo.detalles
                });
            } else {
                // no se pudo determinar una dirección para estas coordenadas
                return res.status(404).json({
                    success: false,
                    message: "No se pudo encontrar una dirección para las coordenadas proporcionadas."
                });
            }
        } catch (error) {
            console.error("Error al convertir coordenadas a dirección:", error);
            res.status(500).json({
                success: false,
                message: "Error interno al convertir coordenadas a dirección."
            });
        }
    });

    /**
     * endpoint post para convertir dirección a coordenadas
     * alternativa que permite enviar direcciones con caracteres especiales
     * evita problemas con el formato de URL en el método GET
     */
    router.post("/direccion-a-coordenadas", async (req, res) => {
        const { direccion } = req.body;

        // verificamos que se haya proporcionado una dirección en el cuerpo
        if (!direccion) {
            return res.status(400).json({
                success: false,
                message: "Se requiere el campo 'direccion' en el cuerpo de la petición."
            });
        }

        try {
            // registramos la dirección recibida para depuración
            console.log("Dirección recibida (POST):", direccion);
            
            // convertimos la dirección en coordenadas mediante el servicio de geocodificación
            const coordenadas = await geocodificarDireccion(direccion);

            if (coordenadas) {
                // retornamos las coordenadas obtenidas y la dirección normalizada
                return res.status(200).json({
                    success: true,
                    direccionOriginal: direccion,
                    direccionNormalizada: coordenadas.direccionNormalizada,
                    coordenadas: {
                        lat: coordenadas.lat,
                        lon: coordenadas.lon
                    }
                });
            } else {
                // no se pudo geocodificar la dirección proporcionada
                return res.status(404).json({
                    success: false,
                    message: "No se pudieron obtener coordenadas para la dirección proporcionada."
                });
            }
        } catch (error) {
            console.error("Error al convertir dirección a coordenadas:", error);
            res.status(500).json({
                success: false,
                message: "Error interno al convertir dirección a coordenadas."
            });
        }
    });

    // endpoint para obtener todos los puntos de concentración registrados
    router.get("/puntos-concentracion", async (req, res) => {
        try {
            const result = await pool.query("SELECT * FROM puntos_concentracion");
            res.status(200).json(result.rows);
        } catch (error) {
            console.error("Error al obtener puntos de concentración:", error);
            res.status(500).json({ message: "Error interno al obtener los puntos de concentración" });
        }
    });

    return router;
} 