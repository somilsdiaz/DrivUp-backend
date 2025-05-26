import express from 'express';
import { calcularDistancia } from '../../utils/geoUtils.js';

const router = express.Router();

const rutas = (pool) => {

  router.get("/conductores-activos-disponibles/:conductor_id", async (req, res) => {
  const { conductor_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM conductores_activos_disponibles WHERE conductor_id = $1`,
      [conductor_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener conductor_activo_disponible:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

  router.get("/viaje-pasajeros/:viaje_id", async (req, res) => {
  const { viaje_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM viaje_pasajeros WHERE viaje_id = $1`,
      [viaje_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener viaje_pasajeros:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

  router.get('/ruta-viaje/:id/:conductor_id', async (req, res) => {
    const { id, conductor_id } = req.params;
    
    try {
      // obtener datos del viaje
      const { rows: viajes } = await pool.query(
        `SELECT * FROM viajes WHERE id = $1`,
        [id]
      );
      
      if (viajes.length === 0) {
        return res.status(404).json({ message: 'Viaje no encontrado' });
      }
      
      const viaje = viajes[0];
      
      // obtener datos del conductor
      const { rows: conductores } = await pool.query(
        `SELECT * FROM conductores_activos_disponibles WHERE conductor_id = $1`,
        [conductor_id]
      );
      
      if (conductores.length === 0) {
        return res.status(404).json({ message: 'Conductor no encontrado' });
      }
      
      const conductor = conductores[0];
      
      // parsear la ruta del geojson
      const rutaGeoJSON = JSON.parse(viaje.ruta);
      
      // verificar si es un linestring valido
      if (rutaGeoJSON.type !== 'LineString' || !Array.isArray(rutaGeoJSON.coordinates)) {
        return res.status(400).json({ message: 'Formato de ruta inválido' });
      }
      
      // convertir coordenadas de [lon, lat] a {lat, lng}
      const puntosRuta = rutaGeoJSON.coordinates.map(coord => ({
        lat: coord[1],
        lng: coord[0]
      }));
      
      // respuesta a construir
      let respuesta = {
        origen: null,
        destino: null,
        puntos_intermedios: []
      };
      
      // caso 1: pmcp es origen
      if (viaje.pmcp_es_origen) {
        respuesta.origen = puntosRuta[0];
        
        const pasajerosCandidatos = puntosRuta.slice(1);
        
        if (pasajerosCandidatos.length === 0) {
          respuesta.destino = null; 
          respuesta.puntos_intermedios = [];
        } else {
          // hay uno o más pasajeros. El destino es el pasajero más lejano al conductor.
          const pasajerosConDistancia = pasajerosCandidatos.map(punto => ({
            punto,
            distancia: calcularDistancia(
              conductor.ubicacion_actual_lat,
              conductor.ubicacion_actual_lon,
              punto.lat,
              punto.lng
            )
          }));
          
          pasajerosConDistancia.sort((a, b) => b.distancia - a.distancia); // ordenar por distancia descendente
          
          respuesta.destino = pasajerosConDistancia[0].punto;
          
          // puntos intermedios son los demás pasajeros, excluyendo el destino seleccionado.
          respuesta.puntos_intermedios = pasajerosCandidatos.filter(
            p => p !== respuesta.destino
          );
        }
      } 
      // caso 2: pmcp es destino (origen particular)
      else {
        respuesta.destino = puntosRuta[puntosRuta.length - 1]; // PMCP es el destino
        
        const posiblesOrigenes = puntosRuta.slice(0, puntosRuta.length - 1);
        
        if (posiblesOrigenes.length === 0) {
          // solo existe el pmcp en la ruta, no hay origen posible.
          respuesta.origen = null;
          respuesta.puntos_intermedios = [];
        } else {
          // calcular distancias desde el conductor a los posibles orígenes (todos los puntos excepto el pmcp)
          const origenesConDistancia = posiblesOrigenes.map(punto => ({
            punto,
            distancia: calcularDistancia(
              conductor.ubicacion_actual_lat,
              conductor.ubicacion_actual_lon,
              punto.lat,
              punto.lng
            )
          }));
          
          // ordenar por distancia al conductor (ascendente) para encontrar el más cercano
          origenesConDistancia.sort((a, b) => a.distancia - b.distancia);
          
          respuesta.origen = origenesConDistancia[0].punto;
          
          // puntos intermedios son los demás puntos (excluyendo pmcp y el origen seleccionado),
          // ordenados por cercanía al conductor.
          let intermediosCandidatos = posiblesOrigenes.filter(
            p => p !== respuesta.origen
          );

          // ordenar los puntos intermedios por distancia al conductor (ascendente)
          intermediosCandidatos.sort((a, b) => {
            const distA = calcularDistancia(
              conductor.ubicacion_actual_lat,
              conductor.ubicacion_actual_lon,
              a.lat,
              a.lng
            );
            const distB = calcularDistancia(
              conductor.ubicacion_actual_lat,
              conductor.ubicacion_actual_lon,
              b.lat,
              b.lng
            );
            return distA - distB;
          });
          respuesta.puntos_intermedios = intermediosCandidatos;
        }
      }
      
      res.json(respuesta);
      
    } catch (error) {
      console.error('Error al obtener ruta del viaje:', error);
      res.status(500).json({ 
        message: 'Error al obtener ruta del viaje',
        error: error.toString() 
      });
    }
  });

  return router;

  
};


export default rutas;
