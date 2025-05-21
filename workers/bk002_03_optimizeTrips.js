// Utilidades para cálculos geoespaciales y optimización de rutas
import format from 'pg-format';

// Función principal para optimizar rutas y crear ofertas de viaje
export async function optimizeRoutes(pool) {
    try {
        // 1. Obtener grupos con combinaciones pendientes de optimización
        const gruposQuery = `
            SELECT DISTINCT gsc.id, gsc.pmcp_id, gsc.pmcp_es_origen_del_grupo
            FROM grupos_solicitudes_candidatos gsc
            JOIN combinaciones_viaje_propuestas cvp ON gsc.id = cvp.grupo_candidato_id
            WHERE cvp.estado_procesamiento = 'optimizacion_pendiente'
        `;

        const gruposResult = await pool.query(gruposQuery);
        const grupos = gruposResult.rows;

        if (grupos.length === 0) {
            console.log("No hay grupos con combinaciones pendientes para optimizar");
            return;
        }

        // Procesar cada grupo
        for (const grupo of grupos) {
            await processGroup(pool, grupo);
        }

        console.log("Optimización de rutas completada con éxito");
    } catch (error) {
        console.error("Error en el proceso de optimización de rutas:", error);
    }
}

async function processGroup(pool, grupo) {
    try {
        // Iniciar transacción para este grupo
        await pool.query('BEGIN');

        // 0. Obtener la capacidad mínima de vehículos disponibles
        const capacidadMinQuery = `
            SELECT MIN(c.capacidad_de_pasajeros) as capacidad_minima
            FROM conductores c 
            JOIN conductores_activos_disponibles cad ON c.id = cad.conductor_id
        `;
        
        const capacidadResult = await pool.query(capacidadMinQuery);
        const capacidadMinima = capacidadResult.rows[0]?.capacidad_minima || 3; // Por defecto 3 si no hay conductores

        // 1. Obtener todas las combinaciones pendientes para este grupo
        const combinacionesQuery = `
            SELECT cvp.id, cvp.numero_pasajeros_en_combinacion
            FROM combinaciones_viaje_propuestas cvp
            WHERE cvp.grupo_candidato_id = $1
            AND cvp.estado_procesamiento = 'optimizacion_pendiente'
        `;

        const combinacionesResult = await pool.query(combinacionesQuery, [grupo.id]);
        const combinaciones = combinacionesResult.rows;

        if (combinaciones.length === 0) {
            await pool.query('COMMIT');
            return;
        }

        // Conjuntos para llevar registro de combinaciones y solicitudes procesadas
        const combinacionesProcesadas = new Set();
        const solicitudesAsignadas = new Set();
        let combinacionesViablesTotales = 0;

        // Iterativamente buscar las mejores combinaciones hasta que no queden suficientes pasajeros
        let continuar = true;
        
        while (continuar) {
            // 2. Filtrar combinaciones que no contengan solicitudes ya asignadas
            const combinacionesElegibles = await filtrarCombinacionesElegibles(
                pool, 
                combinaciones.filter(c => !combinacionesProcesadas.has(c.id)),
                solicitudesAsignadas
            );
            
            if (combinacionesElegibles.length === 0) {
                console.log(`No quedan combinaciones elegibles para el grupo ${grupo.id}`);
                break;
            }
            
            // 3. Evaluar cada combinación elegible para encontrar la óptima
            const combinacionesEvaluadas = await Promise.all(
                combinacionesElegibles.map(combinacion => evaluarCombinacion(pool, combinacion, grupo))
            );
            
            // 4. Filtrar combinaciones viables
            const combinacionesViables = combinacionesEvaluadas.filter(c => c.esViable);
            
            if (combinacionesViables.length === 0) {
                console.log(`No quedan combinaciones viables para el grupo ${grupo.id}`);
                break;
            }
            
            // 5. Encontrar la combinación óptima según los criterios
            const combinacionOptima = encontrarCombinacionOptima(combinacionesViables);
            
            // 6. Crear viaje y registros asociados para la combinación óptima
            await crearOfertaViaje(pool, combinacionOptima, grupo);
            combinacionesViablesTotales++;
            
            // 7. Marcar esta combinación como procesada
            combinacionesProcesadas.add(combinacionOptima.id);
            
            // 8. Registrar solicitudes asignadas
            combinacionOptima.solicitudes.forEach(s => solicitudesAsignadas.add(s.id));
            
            // 9. Verificar si quedan suficientes pasajeros sin asignar para continuar
            const solicitudesPendientesQuery = `
                SELECT COUNT(DISTINCT solicitud_viaje_id) as pendientes
                FROM solicitudes_en_grupo_candidato
                WHERE grupo_candidato_id = $1
                AND solicitud_viaje_id NOT IN (
                    SELECT id FROM solicitudes_viaje WHERE estado = 'ofertado'
                )
            `;
            
            const pendientesResult = await pool.query(solicitudesPendientesQuery, [grupo.id]);
            const pasajerosPendientes = pendientesResult.rows[0].pendientes;
            
            console.log(`Quedan ${pasajerosPendientes} pasajeros sin asignar en el grupo ${grupo.id}`);
            
            // Determinar si continuar el proceso
            continuar = pasajerosPendientes >= capacidadMinima;
        }
        
        // Restaurar solicitudes no asignadas a estado "pendiente"
        const solicitudesSinAsignarQuery = `
            SELECT solicitud_viaje_id
            FROM solicitudes_en_grupo_candidato
            WHERE grupo_candidato_id = $1
            AND solicitud_viaje_id NOT IN (
                SELECT id FROM solicitudes_viaje WHERE estado = 'ofertado'
            )
        `;
        
        const solicitudesSinAsignarResult = await pool.query(solicitudesSinAsignarQuery, [grupo.id]);
        const solicitudesSinAsignar = solicitudesSinAsignarResult.rows.map(r => r.solicitud_viaje_id);
        
        if (solicitudesSinAsignar.length > 0) {
            const updateSolicitudesPendientesQuery = `
                UPDATE solicitudes_viaje
                SET estado = 'pendiente'
                WHERE id = ANY($1)
            `;
            
            await pool.query(updateSolicitudesPendientesQuery, [solicitudesSinAsignar]);
            console.log(`${solicitudesSinAsignar.length} solicitudes del grupo ${grupo.id} restauradas a estado "pendiente"`);
        }
        
        // Marcar las combinaciones restantes como descartadas
        const combinacionesRestantes = combinaciones
            .filter(c => !combinacionesProcesadas.has(c.id))
            .map(c => c.id);
        
        if (combinacionesRestantes.length > 0) {
            const descartarQuery = `
                UPDATE combinaciones_viaje_propuestas
                SET estado_procesamiento = 'descartada_no_rentable'
                WHERE id = ANY($1)
            `;
            await pool.query(descartarQuery, [combinacionesRestantes]);
        }
        
        await pool.query('COMMIT');
        console.log(`Procesamiento completo para el grupo ${grupo.id}. Combinaciones óptimas creadas: ${combinacionesViablesTotales}`);

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`Error procesando el grupo ${grupo.id}:`, error);

        // Marcar combinaciones con error
        try {
            const errorQuery = `
                UPDATE combinaciones_viaje_propuestas
                SET estado_procesamiento = 'error_optimizacion'
                WHERE grupo_candidato_id = $1 AND estado_procesamiento = 'optimizacion_pendiente'
            `;
            await pool.query(errorQuery, [grupo.id]);
        } catch (updateError) {
            console.error("Error al marcar combinaciones con error:", updateError);
        }
    }
}

// Filtra combinaciones que no tengan solicitudes ya asignadas
async function filtrarCombinacionesElegibles(pool, combinaciones, solicitudesAsignadas) {
    if (combinaciones.length === 0) return [];
    if (solicitudesAsignadas.size === 0) return combinaciones;
    
    const resultado = [];
    
    for (const combinacion of combinaciones) {
        // Obtener las solicitudes de esta combinación
        const solicitudesQuery = `
            SELECT solicitud_viaje_id
            FROM solicitudes_en_combinacion_propuesta
            WHERE combinacion_propuesta_id = $1
        `;
        
        const solicitudesResult = await pool.query(solicitudesQuery, [combinacion.id]);
        const solicitudesIds = solicitudesResult.rows.map(r => r.solicitud_viaje_id);
        
        // Verificar si alguna solicitud ya está asignada
        const tieneAsignadas = solicitudesIds.some(id => solicitudesAsignadas.has(id));
        
        // Si no tiene solicitudes asignadas, es elegible
        if (!tieneAsignadas) {
            resultado.push(combinacion);
        }
    }
    
    return resultado;
}

async function evaluarCombinacion(pool, combinacion, grupo) {
    // 1. Obtener detalles de las solicitudes en esta combinación
    const solicitudesQuery = `
        SELECT 
        sv.id, 
        sv.pasajero_id,
        sv.origen_lat, 
        sv.origen_lon, 
        sv.destino_lat, 
        sv.destino_lon,
        sv.es_origen_concentracion,
        sv.es_destino_concentracion
        FROM solicitudes_en_combinacion_propuesta scp
        JOIN solicitudes_viaje sv ON scp.solicitud_viaje_id = sv.id
        WHERE scp.combinacion_propuesta_id = $1
    `;

    const solicitudesResult = await pool.query(solicitudesQuery, [combinacion.id]);
    const solicitudes = solicitudesResult.rows;

    // 2. Obtener datos del punto de concentración
    const pmcpQuery = `
        SELECT latitud, longitud, nombre
        FROM puntos_concentracion
        WHERE id = $1
    `;

    const pmcpResult = await pool.query(pmcpQuery, [grupo.pmcp_id]);
    const pmcp = pmcpResult.rows[0];

    // 3. Calcular la ruta óptima
    const rutaOptima = calcularRutaOptima(solicitudes, pmcp, grupo.pmcp_es_origen_del_grupo);

    // 4. Calcular métricas de la ruta (distancia, tiempo, costos)
    const metricas = calcularMetricas(rutaOptima);

    // 5. Determinar si la combinación es viable
    const esViable = evaluarViabilidad(metricas, combinacion.numero_pasajeros_en_combinacion);

    // 6. Calcular tarifa por pasajero si es viable
    const tarifas = esViable ? calcularTarifasPasajeros(rutaOptima, solicitudes) : [];

    // 7. Calcular ganancia estimada del conductor
    const gananciaEstimada = tarifas.reduce((sum, t) => sum + t.tarifa, 0);

    return {
        id: combinacion.id,
        numeroPassajeros: combinacion.numero_pasajeros_en_combinacion,
        ruta: rutaOptima,
        distanciaTotal: metricas.distanciaTotal,
        tiempoEstimado: metricas.tiempoEstimado,
        gananciaEstimada,
        esViable,
        solicitudes,
        tarifas
    };
}

function calcularRutaOptima(solicitudes, pmcp, esPmcpOrigen) {
    // Estructura para almacenar los puntos de la ruta
    const puntos = [];
    const ordenRecogida = [];
    const ordenEntrega = [];

    // Determinar puntos de origen y destino
    if (esPmcpOrigen) {
        // Si el PMCP es el origen, el conductor recoge a todos desde el PMCP
        // y luego los entrega en sus respectivos destinos
        puntos.push({
            tipo: 'pmcp',
            lat: pmcp.latitud,
            lon: pmcp.longitud,
            nombre: pmcp.nombre
        });

        // Ordenar destinos para optimizar ruta (algoritmo greedy simple)
        let ultimoPunto = { lat: pmcp.latitud, lon: pmcp.longitud };
        const destinos = [...solicitudes];

        // Asignar orden de recogida (todos en el PMCP)
        solicitudes.forEach((sol, index) => {
            ordenRecogida.push({
                solicitudId: sol.id,
                orden: 0 // Todos se recogen en el PMCP (orden 0)
            });
        });

        // Asignar orden de entrega (optimizando ruta)
        let orden = 1;
        while (destinos.length > 0) {
            const indiceMasCercano = encontrarPuntoMasCercano(ultimoPunto, destinos);
            const destinoActual = destinos.splice(indiceMasCercano, 1)[0];

            puntos.push({
                tipo: 'destino',
                solicitudId: destinoActual.id,
                lat: destinoActual.destino_lat,
                lon: destinoActual.destino_lon
            });

            ordenEntrega.push({
                solicitudId: destinoActual.id,
                orden
            });

            ultimoPunto = { lat: destinoActual.destino_lat, lon: destinoActual.destino_lon };
            orden++;
        }
    } else {
        // Si el PMCP es el destino, el conductor recoge a todos en sus respectivos orígenes
        // y luego los entrega a todos en el PMCP

        // Ordenar orígenes para optimizar ruta (algoritmo greedy simple)
        let ultimoPunto = null; // Se definirá con el primer origen
        const origenes = [...solicitudes];

        // Asignar orden de recogida (optimizando ruta)
        let orden = 1;
        while (origenes.length > 0) {
            let indiceMasCercano;

            if (ultimoPunto === null) {
                // Para el primer punto, elegimos cualquiera (o podríamos elegir el más cercano a un punto de referencia)
                indiceMasCercano = 0;
            } else {
                indiceMasCercano = encontrarPuntoMasCercano(ultimoPunto, origenes, true);
            }

            const origenActual = origenes.splice(indiceMasCercano, 1)[0];

            puntos.push({
                tipo: 'origen',
                solicitudId: origenActual.id,
                lat: origenActual.origen_lat,
                lon: origenActual.origen_lon
            });

            ordenRecogida.push({
                solicitudId: origenActual.id,
                orden
            });

            ultimoPunto = { lat: origenActual.origen_lat, lon: origenActual.origen_lon };
            orden++;
        }

        // Añadir el PMCP como destino final
        puntos.push({
            tipo: 'pmcp',
            lat: pmcp.latitud,
            lon: pmcp.longitud,
            nombre: pmcp.nombre
        });

        // Asignar orden de entrega (todos en el PMCP)
        solicitudes.forEach((sol) => {
            ordenEntrega.push({
                solicitudId: sol.id,
                orden: orden // Todos se entregan en el PMCP al final
            });
        });
    }

    // Convertir puntos a formato GeoJSON LineString
    const geoJson = {
        type: 'LineString',
        coordinates: puntos.map(p => [parseFloat(p.lon), parseFloat(p.lat)])
    };

    return {
        puntos,
        geoJson,
        ordenRecogida,
        ordenEntrega
    };
}

function encontrarPuntoMasCercano(puntoReferencia, puntos, esOrigen = false) {
    let distanciaMinima = Infinity;
    let indiceMasCercano = 0;

    for (let i = 0; i < puntos.length; i++) {
        const punto = puntos[i];
        const lat = esOrigen ? punto.origen_lat : punto.destino_lat;
        const lon = esOrigen ? punto.origen_lon : punto.destino_lon;

        const distancia = calcularDistanciaHaversine(
            puntoReferencia.lat,
            puntoReferencia.lon,
            lat,
            lon
        );

        if (distancia < distanciaMinima) {
            distanciaMinima = distancia;
            indiceMasCercano = i;
        }
    }

    return indiceMasCercano;
}

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    // Convertir de grados a radianes
    const toRad = (valor) => valor * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    lat1 = toRad(lat1);
    lat2 = toRad(lat2);

    // Fórmula de Haversine
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Radio de la Tierra en kilómetros
    const radioTierra = 6371;
    return radioTierra * c;
}

function calcularMetricas(ruta) {
    // Calcular distancia total de la ruta
    let distanciaTotal = 0;
    const puntos = ruta.puntos;

    for (let i = 1; i < puntos.length; i++) {
        const puntoAnterior = puntos[i - 1];
        const puntoActual = puntos[i];

        const distancia = calcularDistanciaHaversine(
            puntoAnterior.lat,
            puntoAnterior.lon,
            puntoActual.lat,
            puntoActual.lon
        );

        distanciaTotal += distancia;
    }

    // Estimar tiempo en minutos (asumiendo velocidad promedio de 30 km/h en ciudad)
    const velocidadPromedio = 30; // km/h
    const tiempoEstimado = Math.ceil((distanciaTotal / velocidadPromedio) * 60); // en minutos

    return {
        distanciaTotal,
        tiempoEstimado
    };
}

function evaluarViabilidad(metricas, numeroPasajeros) {
    // Criterios de viabilidad:
    // 1. Distancia total no debe ser excesiva (ej: < 30 km)
    // 2. Tiempo estimado razonable (ej: < 60 minutos)
    // 3. Número mínimo de pasajeros (ej: >= 3)

    const distanciaMaxima = 30; // km
    const tiempoMaximo = 60; // minutos
    const pasajerosMinimos = 3;

    return (
        metricas.distanciaTotal <= distanciaMaxima &&
        metricas.tiempoEstimado <= tiempoMaximo &&
        numeroPasajeros >= pasajerosMinimos
    );
}

function calcularTarifasPasajeros(ruta, solicitudes) {
    const tarifaBase = 2000; // Tarifa base por pasajero
    const tarifaPorKm = 1000; // Tarifa adicional por km
    const tarifas = [];

    // Calcular tarifa para cada pasajero basada en su distancia individual
    for (const solicitud of solicitudes) {
        // Calcular la distancia directa entre origen y destino
        const distanciaDirecta = calcularDistanciaHaversine(
            solicitud.origen_lat,
            solicitud.origen_lon,
            solicitud.destino_lat,
            solicitud.destino_lon
        );

        // Calcular tarifa (base + proporcional a la distancia)
        // Aplicamos un descuento para beneficiar al pasajero por compartir el viaje
        const descuentoPorCompartir = 0.8; // 20% de descuento
        const tarifa = Math.ceil((tarifaBase + (distanciaDirecta * tarifaPorKm)) * descuentoPorCompartir);

        tarifas.push({
            solicitudId: solicitud.id,
            distancia: distanciaDirecta,
            tarifa
        });
    }

    return tarifas;
}

function encontrarCombinacionOptima(combinaciones) {
    // Ordenar por prioridades:
    // 1. Maximizar número de pasajeros
    // 2. Minimizar distancia
    // 3. Maximizar ganancia para el conductor

    return combinaciones.sort((a, b) => {
        // Primero por número de pasajeros (mayor es mejor)
        if (b.numeroPassajeros !== a.numeroPassajeros) {
            return b.numeroPassajeros - a.numeroPassajeros;
        }

        // Si tienen igual número de pasajeros, ordenar por distancia (menor es mejor)
        if (a.distanciaTotal !== b.distanciaTotal) {
            return a.distanciaTotal - b.distanciaTotal;
        }

        // Si tienen igual distancia, ordenar por ganancia (mayor es mejor)
        return b.gananciaEstimada - a.gananciaEstimada;
    })[0]; // Tomar el primero después de ordenar
}

async function crearOfertaViaje(pool, combinacion, grupo) {
    try {
        // 1. Crear el viaje
        const viajeQuery = `
        INSERT INTO viajes(
            conductor_id,
            punto_concentracion_id,
            pmcp_es_origen,
            ruta,
            distancia_km,
            tiempo_estimado_min,
            ganancia_estimada_conductor,
            numero_pasajeros_total,
            estado,
            combinacion_origen_id
        )
        VALUES(NULL, $1, $2, $3, $4, $5, $6, $7, 'disponible', $8)
        RETURNING id
        `;

        const viajeParams = [
            grupo.pmcp_id,
            grupo.pmcp_es_origen_del_grupo,
            JSON.stringify(combinacion.ruta.geoJson),
            combinacion.distanciaTotal,
            combinacion.tiempoEstimado,
            combinacion.gananciaEstimada,
            combinacion.numeroPassajeros,
            combinacion.id
        ];

        const viajeResult = await pool.query(viajeQuery, viajeParams);
        const viajeId = viajeResult.rows[0].id;

        // 2. Crear registros en viaje_pasajeros
        const viajePasajerosValues = combinacion.solicitudes.map(solicitud => {
            const ordenRecogida = combinacion.ruta.ordenRecogida.find(
                or => or.solicitudId === solicitud.id
            ).orden;

            const ordenEntrega = combinacion.ruta.ordenEntrega.find(
                oe => oe.solicitudId === solicitud.id
            ).orden;

            const tarifa = combinacion.tarifas.find(
                t => t.solicitudId === solicitud.id
            ).tarifa;

            return [
                viajeId,
                solicitud.id,
                ordenRecogida,
                ordenEntrega,
                tarifa
            ];
        });

        const viajePasajerosQuery = format(
        `INSERT INTO viaje_pasajeros(
            viaje_id,
            solicitud_viaje_id,
            orden_recogida,
            orden_entrega,
            tarifa_pasajero
        ) VALUES %L`,
                viajePasajerosValues
            );

        await pool.query(viajePasajerosQuery);

        // 3. Actualizar el estado de las solicitudes de viaje a 'ofertado'
        const solicitudIds = combinacion.solicitudes.map(s => s.id);
        const updateSolicitudesQuery = `
        UPDATE solicitudes_viaje
        SET estado = 'ofertado'
        WHERE id = ANY($1)
        `;

        await pool.query(updateSolicitudesQuery, [solicitudIds]);

        // 4. Actualizar el estado de la combinación a 'optimizada_oferta_creada'
        const updateCombinacionQuery = `
        UPDATE combinaciones_viaje_propuestas
        SET estado_procesamiento = 'optimizada_oferta_creada'
        WHERE id = $1
        `;

        await pool.query(updateCombinacionQuery, [combinacion.id]);

        console.log(`Viaje #${viajeId} creado exitosamente para la combinación ${combinacion.id}`);

    } catch (error) {
        console.error("Error al crear oferta de viaje:", error);
        throw error;
    }
}
