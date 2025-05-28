import express from 'express';
import { calcularDistancia } from '../../utils/geoUtils.js';

const router = express.Router();

const listadoViajes = (pool) => {
    router.get('/viajes-disponibles/:conductor_id', async (req, res) => {
        const { conductor_id } = req.params;

        try {
            // obtenemos la ubicación actual del conductor
            const { rows: conductores } = await pool.query(
                `SELECT ubicacion_actual_lat, ubicacion_actual_lon 
         FROM conductores_activos_disponibles 
         WHERE conductor_id = $1`,
                [conductor_id]
            );

            if (conductores.length === 0) {
                return res.status(404).json({ message: 'Conductor no encontrado o no disponible' });
            }

            const conductor = conductores[0];

            // obtenemos todos los viajes disponibles
            const { rows: viajes } = await pool.query(
                `SELECT * FROM viajes WHERE estado = 'disponible'`
            );

            if (viajes.length === 0) {
                return res.status(200).json({ message: 'No hay viajes disponibles', viajes: [] });
            }

            // hallamos la distancia para cada viaje desde la ubicación del conductor
            // hasta el primer punto de la ruta
            const viajesConDistancia = viajes.map(viaje => {
                try {
                    // Parsear la ruta GeoJSON
                    const ruta = JSON.parse(viaje.ruta);

                    // Verificar si la ruta tiene el formato correcto
                    if (ruta.type !== 'LineString' || !Array.isArray(ruta.coordinates) || ruta.coordinates.length === 0) {
                        return { ...viaje, distancia_conductor: Number.MAX_VALUE };
                    }

                    // obtenemos el primer punto de la ruta [lon, lat]
                    const primerPunto = ruta.coordinates[0];

                    // calculamos la distancia desde el conductor hasta el primer punto
                    const distancia = calcularDistancia(
                        conductor.ubicacion_actual_lat,
                        conductor.ubicacion_actual_lon,
                        primerPunto[1], 
                        primerPunto[0]  
                    );

                    return { ...viaje, distancia_conductor: distancia };
                } catch (error) {
                    console.error(`Error procesando viaje ${viaje.id}:`, error);
                    return { ...viaje, distancia_conductor: Number.MAX_VALUE };
                }
            });

            // ordenar viajes por distancia (de menor a mayor)
            viajesConDistancia.sort((a, b) => a.distancia_conductor - b.distancia_conductor);

            res.json({
                conductor_id,
                ubicacion_conductor: {
                    lat: conductor.ubicacion_actual_lat,
                    lon: conductor.ubicacion_actual_lon
                },
                viajes: viajesConDistancia
            });

        } catch (error) {
            console.error('Error al obtener viajes:', error);
            res.status(500).json({
                message: 'Error al obtener viajes disponibles',
                error: error.toString()
            });
        }
    });

     router.get("/lista-viajes-conductor", async (req, res) => {
    const { id } = req.query; 
    try {
      const reseñas = await pool.query(`
              select p.nombre as punto_concentracion,
v.numero_pasajeros_total as cantidad_pasajeros,
v.ganancia_estimada_conductor as ganancia_estimada,
v.tiempo_estimado_min as tiempo_estimado, v.* from viajes as v
inner join puntos_concentracion as p 
on v.punto_concentracion_id=p.id
where v.id=${id}
            `);

      res.status(200).json(reseñas.rows);
    } catch (error) {
      console.error("Error al obtener la lista de viajes:", error);
      res.status(500).json({ message: "Error interno al obtener la lista de viajes" });
    }
  });

router.get("/lista-viajes-pasajero", async (req, res) => {
    const { id } = req.query; 
    try {
      const reseñas = await pool.query(`
select pc.nombre as punto_concentracion,
v.numero_pasajeros_total as cantidad_pasajeros,
v.ganancia_estimada_conductor as ganancia_estimada,
v.tiempo_estimado_min as tiempo_estimado, v.*
FROM viajes v
JOIN viaje_pasajeros vp ON v.id = vp.viaje_id
JOIN solicitudes_viaje sv ON vp.solicitud_viaje_id = sv.id
join puntos_concentracion pc on v.punto_concentracion_id=pc.id
where sv.pasajero_id=${id}
            `);

      res.status(200).json(reseñas.rows);
    } catch (error) {
      console.error("Error al obtener la lista de viajes:", error);
      res.status(500).json({ message: "Error interno al obtener la lista de viajes" });
    }
  });


    return router;
};

export default listadoViajes;
