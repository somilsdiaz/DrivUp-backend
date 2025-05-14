import axios from 'axios';
import { config } from 'dotenv';

config();

// usamos nominatim (openstreetmap) para geocodificación gratuita
// tiene límites de uso

/**
 * convierte dirección física en coordenadas geográficas (lat/long)
 * @param {string} direccion - dirección física a geocodificar (ej: "Calle 98 #52-115, Barranquilla")
 * @returns {Promise<{lat: number, lon: number} | null>} - coordenadas o null si no se encontró
 */
export async function geocodificarDireccion(direccion) {
  try {
    // registramos la dirección recibida para facilitar depuración
    console.log("Geocodificando dirección:", direccion);
    
    // codificamos la dirección para que sea segura en URLs
    const direccionCodificada = encodeURIComponent(direccion);
    console.log("Dirección codificada:", direccionCodificada);
    
    // consultamos a nominatim para obtener coordenadas desde la dirección
    const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
      params: {
        q: direccion, // axios maneja la codificación automáticamente
        format: 'json',
        limit: 1, // solo necesitamos el mejor resultado
        addressdetails: 1, // incluir detalles de la dirección en respuesta
        countrycodes: 'co' // limitamos a Colombia para resultados más precisos
      },
      headers: {
        'User-Agent': 'DrivUp-App/1.0' // nominatim requiere identificación del cliente
      }
    });

    // verificamos y procesamos los resultados de la búsqueda
    if (response.data && response.data.length > 0) {
      const resultado = response.data[0];
      console.log("Resultado de geocodificación:", resultado);
      return {
        lat: parseFloat(resultado.lat),
        lon: parseFloat(resultado.lon),
        direccionNormalizada: resultado.display_name // dirección formateada por nominatim
      };
    } else {
      console.log(`No se encontraron coordenadas para: ${direccion}`);
      
      // si no hay resultados, intentamos especificando el país explícitamente
      const responseColombia = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: {
          q: `${direccion}, Colombia`, // agregamos el país para mejorar resultados
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'DrivUp-App/1.0'
        }
      });
      
      if (responseColombia.data && responseColombia.data.length > 0) {
        const resultadoColombia = responseColombia.data[0];
        console.log("Resultado con especificación de Colombia:", resultadoColombia);
        return {
          lat: parseFloat(resultadoColombia.lat),
          lon: parseFloat(resultadoColombia.lon),
          direccionNormalizada: resultadoColombia.display_name
        };
      }
      
      return null; // no se encontró ninguna coincidencia
    }
  } catch (error) {
    console.error(`Error al geocodificar: ${direccion}`, error);
    throw error; // propagamos el error para manejarlo en el controlador
  }
}

/**
 * convierte coordenadas geográficas en dirección física (geocodificación inversa)
 * @param {number} lat - latitud del punto (ej: 11.0041072)
 * @param {number} lon - longitud del punto (ej: -74.8069813)
 * @returns {Promise<{direccion: string, detalles: Object} | null>} - dirección encontrada o null
 */
export async function reverseGeocodificar(lat, lon) {
  try {
    // consultamos a nominatim para convertir coordenadas en dirección
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: {
        lat: lat,
        lon: lon,
        format: 'json',
        addressdetails: 1 // incluir componentes detallados de la dirección
      },
      headers: {
        'User-Agent': 'DrivUp-App/1.0' // identificación requerida por nominatim
      }
    });

    // procesamos la respuesta para obtener la dirección
    if (response.data && response.data.display_name) {
      return {
        direccion: response.data.display_name, // dirección completa formateada
        detalles: response.data.address // componentes individuales (calle, ciudad, etc)
      };
    } else {
      console.log(`No se encontró dirección para: ${lat}, ${lon}`);
      return null; // no se encontró dirección para estas coordenadas
    }
  } catch (error) {
    console.error(`Error en geocodificación inversa: ${lat}, ${lon}`, error);
    throw error; // propagamos el error para manejarlo en el controlador
  }
}

/**
 * calcula distancia entre dos puntos geográficos usando la fórmula de haversine
 * esta fórmula considera la curvatura de la tierra para mayor precisión
 * @param {number} lat1 - latitud del primer punto
 * @param {number} lon1 - longitud del primer punto
 * @param {number} lat2 - latitud del segundo punto
 * @param {number} lon2 - longitud del segundo punto
 * @returns {number} - distancia en metros entre los dos puntos
 */
export function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // radio de la tierra en metros
  const φ1 = lat1 * Math.PI / 180; // conversión a radianes
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180; // diferencia de latitudes
  const Δλ = (lon2 - lon1) * Math.PI / 180; // diferencia de longitudes

  // fórmula de haversine
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // distancia final

  return d; // distancia en metros
} 