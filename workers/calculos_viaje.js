/**
 * Módulo para calcular información de viajes: costos, tiempos y distancias
 */
import { calcularDistancia } from './geocoding.js';

/**
 * Calcula el tiempo estimado de viaje considerando factores reales
 * @param {number} distanciaMetros - distancia en metros entre origen y destino
 * @param {boolean} origenEsConcentracion - si el origen es un punto de concentración
 * @param {boolean} destinoEsConcentracion - si el destino es un punto de concentración
 * @returns {Object} - objeto con tiempo en minutos y desglose de componentes
 */
export function calcularTiempoEstimado(distanciaMetros, origenEsConcentracion = false, destinoEsConcentracion = false) {
  // Velocidad promedio en zonas urbanas (km/h)
  const velocidadPromedioKmh = 25;
  
  // Convertir velocidad a metros por minuto
  const velocidadMetrosMinuto = (velocidadPromedioKmh * 1000) / 60;
  
  // Cálculo básico del tiempo de viaje en minutos basado en la distancia
  const tiempoViajeBasico = distanciaMetros / velocidadMetrosMinuto;
  
  // Factores adicionales en minutos
  const tiempoRecogidaPasajeros = origenEsConcentracion ? 3 : 8; // tiempo para recoger pasajeros
  const tiempoLlegadaDestino = destinoEsConcentracion ? 2 : 5; // tiempo para llegar al destino exacto
  
  // Factor de tráfico: aumenta el tiempo base en un porcentaje
  // Se podría mejorar con datos de hora pico, día de la semana, etc.
  const factorTrafico = 1.3; // 30% adicional por tráfico
  
  // Tiempo total estimado
  const tiempoTotal = (tiempoViajeBasico * factorTrafico) + tiempoRecogidaPasajeros + tiempoLlegadaDestino;
  
  return {
    tiempoTotalMinutos: Math.ceil(tiempoTotal),
    desglose: {
      tiempoViajeBasico: Math.ceil(tiempoViajeBasico),
      tiempoTrafico: Math.ceil(tiempoViajeBasico * (factorTrafico - 1)),
      tiempoRecogida: tiempoRecogidaPasajeros,
      tiempoLlegada: tiempoLlegadaDestino
    }
  };
}

/**
 * Calcula el rango de costo para un viaje basado en varios factores
 * @param {number} distanciaMetros - distancia en metros entre origen y destino
 * @param {number} numPasajeros - número de pasajeros que comparten el vehículo (por defecto 4)
 * @returns {Object} - objeto con costos mínimo y máximo y desglose
 */
export function calcularCostoViaje(distanciaMetros, numPasajeros = 4) {
  // Tarifa base por kilómetro (en pesos colombianos)
  const tarifaBaseKm = 1200;
  
  // Convertir distancia a kilómetros
  const distanciaKm = distanciaMetros / 1000;
  
  // Costo base del viaje
  const costoBase = distanciaKm * tarifaBaseKm;
  
  // Factor de eficiencia por cantidad de pasajeros (más pasajeros = más eficiente)
  let factorPasajeros;
  switch(numPasajeros) {
    case 1: factorPasajeros = 1.0; break; // sin descuento
    case 2: factorPasajeros = 0.9; break; // 10% de descuento
    case 3: factorPasajeros = 0.8; break; // 20% de descuento
    default: factorPasajeros = 0.7; break; // 30% de descuento para 4+ pasajeros
  }
  
  // Costo por pasajero después de aplicar el factor
  const costoPorPasajero = (costoBase * factorPasajeros) / numPasajeros;
  
  // Comisión para la plataforma (15% del total)
  const comisionPlataforma = costoPorPasajero * 0.15;
  
  // Rango de costos (mínimo y máximo) con variación del 10%
  const costoMinimo = Math.ceil((costoPorPasajero + comisionPlataforma) * 0.95 / 100) * 100; // redondear a 100 más cercano
  const costoMaximo = Math.ceil((costoPorPasajero + comisionPlataforma) * 1.15 / 100) * 100; // redondear a 100 más cercano
  
  // Desglose de los costos
  return {
    costoMinimo,
    costoMaximo,
    desglose: {
      costoBase: Math.ceil(costoBase),
      costoPorPasajero: Math.ceil(costoPorPasajero),
      comisionPlataforma: Math.ceil(comisionPlataforma),
      factorPasajeros
    }
  };
}

/**
 * Calcula toda la información del viaje: distancia, tiempo y costo
 * @param {number} origenLat - latitud del origen
 * @param {number} origenLon - longitud del origen
 * @param {number} destinoLat - latitud del destino
 * @param {number} destinoLon - longitud del destino
 * @param {boolean} origenEsConcentracion - si el origen es un punto de concentración
 * @param {boolean} destinoEsConcentracion - si el destino es un punto de concentración
 * @param {number} numPasajeros - número de pasajeros que comparten el vehículo
 * @returns {Object} - objeto con toda la información del viaje
 */
export function calcularInfoViaje(
  origenLat, 
  origenLon, 
  destinoLat, 
  destinoLon, 
  origenEsConcentracion = false, 
  destinoEsConcentracion = false,
  numPasajeros = 4
) {
  // Calculamos la distancia en metros
  const distanciaMetros = calcularDistancia(origenLat, origenLon, destinoLat, destinoLon);
  
  // Calculamos el tiempo estimado
  const tiempo = calcularTiempoEstimado(distanciaMetros, origenEsConcentracion, destinoEsConcentracion);
  
  // Calculamos el costo
  const costo = calcularCostoViaje(distanciaMetros, numPasajeros);
  
  // Retornamos toda la información
  return {
    distancia: {
      metros: distanciaMetros,
      kilometros: +(distanciaMetros / 1000).toFixed(2)
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