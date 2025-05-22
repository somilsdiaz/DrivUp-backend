/**
 * modulo para calcular informacion de viajes: costos, tiempos y distancias
 */
import { calcularDistancia } from './geocoding.js';

/**
 * calcula la distancia entre dos puntos geograficos usando la formula de haversine
 * @param {number} lat1 - latitud del punto de origen
 * @param {number} lon1 - longitud del punto de origen
 * @param {number} lat2 - latitud del punto de destino
 * @param {number} lon2 - longitud del punto de destino
 * @returns {number} - distancia en kilometros
 */
export function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  // convertir de grados a radianes
  const toRad = (valor) => valor * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  lat1 = toRad(lat1);
  lat2 = toRad(lat2);

  // formula de haversine
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // radio de la tierra en kilometros
  const radioTierra = 6371;
  return radioTierra * c;
}

/**
 * calcula el tiempo estimado de viaje considerando factores reales
 * @param {number} distanciaKm - distancia en kilometros entre origen y destino
 * @param {boolean} origenEsConcentracion - si el origen es un punto de concentracion
 * @param {boolean} destinoEsConcentracion - si el destino es un punto de concentracion
 * @returns {Object} - objeto con tiempo en minutos y desglose de componentes
 */
export function calcularTiempoEstimado(distanciaKm, origenEsConcentracion = false, destinoEsConcentracion = false) {
  // velocidad promedio en zonas urbanas (km/h)
  const velocidadPromedio = 30; // km/h consistente con bk002_03_optimizeTrips.js
  
  // calculo del tiempo de viaje en minutos basado en la distancia
  const tiempoViajeBasico = Math.ceil((distanciaKm / velocidadPromedio) * 60); // en minutos
  
  // factores adicionales en minutos
  const tiempoRecogidaPasajeros = origenEsConcentracion ? 3 : 8; // tiempo para recoger pasajeros
  const tiempoLlegadaDestino = destinoEsConcentracion ? 2 : 5; // tiempo para llegar al destino exacto
  
  // factor de trafico: aumenta el tiempo base en un porcentaje
  const factorTrafico = 1.3; // 30% adicional por trafico
  
  // tiempo total estimado
  const tiempoTotal = (tiempoViajeBasico * factorTrafico) + tiempoRecogidaPasajeros + tiempoLlegadaDestino;
  
  return {
    tiempoTotalMinutos: Math.ceil(tiempoTotal),
    desglose: {
      tiempoViajeBasico,
      tiempoTrafico: Math.ceil(tiempoViajeBasico * (factorTrafico - 1)),
      tiempoRecogida: tiempoRecogidaPasajeros,
      tiempoLlegada: tiempoLlegadaDestino
    }
  };
}

/**
 * calcula el rango de costo para un viaje basado en varios factores usando la logica de tarifasPasajeros
 * @param {number} distanciaKm - distancia en kilometros entre origen y destino
 * @param {number} numPasajeros - numero de pasajeros que comparten el vehiculo
 * @returns {Object} - objeto con costos minimo y maximo y desglose
 */
export function calcularCostoViaje(distanciaKm, numPasajeros = 1) {
  // parametros de tarifa consistentes con bk002_03_optimizeTrips.js
  const tarifaBase = 2000; // tarifa base por pasajero
  const tarifaPorKm = 1000; // tarifa adicional por km
  
  // calcular tarifa base segun la distancia
  const costoPorDistancia = tarifaBase + (distanciaKm * tarifaPorKm);
  
  // factor de descuento por compartir viaje
  let descuentoPorCompartir;
  switch(numPasajeros) {
    case 1: descuentoPorCompartir = 1.0; break; // sin descuento
    case 2: descuentoPorCompartir = 0.9; break; // 10% de descuento
    case 3: descuentoPorCompartir = 0.85; break; // 15% de descuento
    default: descuentoPorCompartir = 0.8; break; // 20% de descuento para 4+ pasajeros (como en bk002_03_optimizeTrips.js)
  }
  
  // costo por pasajero despues de aplicar el descuento
  const costoPorPasajero = Math.ceil(costoPorDistancia * descuentoPorCompartir);
  
  // comision para la plataforma (15% del total)
  const comisionPlataforma = Math.ceil(costoPorPasajero * 0.15);
  
  // costo total incluyendo comision
  const costoTotal = costoPorPasajero + comisionPlataforma;
  
  // rango de costos (minimo y maximo) con variacion del 10%
  const costoMinimo = Math.ceil(costoTotal * 0.95 / 100) * 100; // redondear a 100 mas cercano
  const costoMaximo = Math.ceil(costoTotal * 1.05 / 100) * 100; // redondear a 100 mas cercano
  
  // desglose de los costos
  return {
    costoMinimo,
    costoMaximo,
    costoRecomendado: costoTotal,
    desglose: {
      tarifaBase,
      costoPorDistancia: Math.ceil(distanciaKm * tarifaPorKm),
      descuentoPorCompartir,
      costoPorPasajero,
      comisionPlataforma
    }
  };
}

/**
 * calcula toda la informacion del viaje: distancia, tiempo y costo
 * @param {number} origenLat - latitud del origen
 * @param {number} origenLon - longitud del origen
 * @param {number} destinoLat - latitud del destino
 * @param {number} destinoLon - longitud del destino
 * @param {boolean} origenEsConcentracion - si el origen es un punto de concentracion
 * @param {boolean} destinoEsConcentracion - si el destino es un punto de concentracion
 * @param {number} numPasajeros - numero de pasajeros que comparten el vehiculo
 * @returns {Object} - objeto con toda la informacion del viaje
 */
export function calcularInfoViaje(
  origenLat, 
  origenLon, 
  destinoLat, 
  destinoLon, 
  origenEsConcentracion = false, 
  destinoEsConcentracion = false,
  numPasajeros = 1
) {
  // calculamos la distancia usando la formula de haversine (en km)
  const distanciaKm = calcularDistanciaHaversine(origenLat, origenLon, destinoLat, destinoLon);
  
  // calculamos el tiempo estimado
  const tiempo = calcularTiempoEstimado(distanciaKm, origenEsConcentracion, destinoEsConcentracion);
  
  // calculamos el costo
  const costo = calcularCostoViaje(distanciaKm, numPasajeros);
  
  // retornamos toda la informacion
  return {
    distancia: {
      metros: distanciaKm * 1000,
      kilometros: +distanciaKm.toFixed(2)
    },
    tiempo,
    costo,
    parametros: {
      origen: { lat: origenLat, lon: origenLon, esPuntoConcentracion: origenEsConcentracion },
      destino: { lat: destinoLat, lon: destinoLon, esPuntoConcentracion: destinoEsConcentracion },
      numPasajeros
    }
  };
} 