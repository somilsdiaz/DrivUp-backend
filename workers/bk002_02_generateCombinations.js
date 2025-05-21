// Importar pg-format para inserciones masivas
import format from 'pg-format';

function getCombinations(arr, min, lon) {
  const results = [];

  function backtrack(start, combo, size) {
    if (combo.length === size) {
      results.push({ pasajeros_participantes: [...combo], capacidad_utilizada: size });
      return;
    }

    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo, size);
      combo.pop();
    }
  }

  for (let k = min; k <= lon; k++) {
    backtrack(0, [], k);
  }

  return results;
}

async function combinaciones_viajes_propuestas(pool, obj) {
  try {
    // Usar transacciones para optimizar las inserciones
    await pool.query('BEGIN');
    
    // Tamaño máximo de lote para evitar problemas de memoria o límites de DB
    const BATCH_SIZE = 1000;
    
    // Preparar queries
    const combinacionesQuery = `
      INSERT INTO combinaciones_viaje_propuestas (
        grupo_candidato_id,
        numero_pasajeros_en_combinacion,
        estado_procesamiento
      ) VALUES %L
      RETURNING id`;
      
    const solicitudesQuery = `
      INSERT INTO solicitudes_en_combinacion_propuesta (
        combinacion_propuesta_id,
        solicitud_viaje_id
      ) VALUES %L`;
    
    // Procesar las combinaciones en lotes si hay muchas
    const totalCombinaciones = obj.combinaciones.length;
    const combinacionIds = [];
    
    for (let offset = 0; offset < totalCombinaciones; offset += BATCH_SIZE) {
      // Tomar un subconjunto de combinaciones para este lote
      const batchLimit = Math.min(offset + BATCH_SIZE, totalCombinaciones);
      const combinacionesBatch = obj.combinaciones.slice(offset, batchLimit);
      
      // Crear valores para las combinaciones de este lote
      const combinacionesValues = combinacionesBatch.map(combinacion => [
        obj.grupo_candidato_id, 
        combinacion.capacidad_utilizada, 
        'optimizacion_pendiente'
      ]);
      
      // Insertar lote de combinaciones y obtener IDs
      const combinacionesInsert = format(combinacionesQuery, combinacionesValues);
      const idsResult = await pool.query(combinacionesInsert);
      combinacionIds.push(...idsResult.rows.map(row => row.id));
    }
    
    // Procesar las solicitudes en lotes
    let solicitudesValues = [];
    let batchCounter = 0;
    
    for (let i = 0; i < obj.combinaciones.length; i++) {
      const combinacionId = combinacionIds[i];
      
      for (let j = 0; j < obj.combinaciones[i].pasajeros_participantes.length; j++) {
        solicitudesValues.push([
          combinacionId,
          obj.combinaciones[i].pasajeros_participantes[j].solicitud_id
        ]);
        
        batchCounter++;
        
        // Si alcanzamos el tamaño del lote, insertar y reiniciar
        if (batchCounter >= BATCH_SIZE) {
          const solicitudesInsert = format(solicitudesQuery, solicitudesValues);
          await pool.query(solicitudesInsert);
          solicitudesValues = [];
          batchCounter = 0;
        }
      }
    }
    
    // Insertar cualquier solicitud restante
    if (solicitudesValues.length > 0) {
      const solicitudesInsert = format(solicitudesQuery, solicitudesValues);
      await pool.query(solicitudesInsert);
    }
    
    // Confirmar la transacción
    await pool.query('COMMIT');
    console.log(`Insertadas ${totalCombinaciones} combinaciones en la base de datos`);
    
  } catch (error) {
    // Revertir la transacción en caso de error
    await pool.query('ROLLBACK');
    console.log("Error al crear las combinaciones:", error);
    throw error; // Re-lanzar el error para manejarlo en la función llamadora
  }
}

async function update(pool, id) {
  try {
    const query = `
      UPDATE grupos_solicitudes_candidatos
      SET estado_procesamiento = 'combinaciones_generadas'
      WHERE id = $1
    `;
    await pool.query(query, [id]);
  } catch (error) {
    console.error("Error al actualizar el estado:", error);
  }
}

function obtenerCapacidadMinima(datos) {

  return Math.min(...datos.map(d => d.capacidad_de_pasajeros));
}

function obtenerCapacidadMaxima(datos) {
  return Math.max(...datos.map(d => d.capacidad_de_pasajeros));
}

async function combinaciones(pool, grupos, conductores) {

  const min = obtenerCapacidadMinima(conductores);
  const max = obtenerCapacidadMaxima(conductores);
  let combi;
  for (let j = 0; j < grupos.length; j++) {
    if (grupos[j].solicitudes !== null && grupos[j].solicitudes.length > min) {
      combi = {
        grupo_candidato_id: grupos[j].id,
        pmcp_id: grupos[j].pmcp_id,
        pmcp_es_origen_del_grupo: grupos[j].pmcp_es_origen_del_grupo,
        combinaciones: getCombinations(grupos[j].solicitudes, min, max),
      };
      
      console.log(`Generadas ${combi.combinaciones.length} combinaciones para el grupo ${grupos[j].id}`);
      await combinaciones_viajes_propuestas(pool, combi);
    }

    await update(pool, grupos[j].id);
  }

  console.log("Combinaciones generadas con éxito.");
}

export async function generateCombinations(pool) {
  try {
    const data1 = await pool.query(`
    SELECT jsonb_build_object(
    'solicitudes_agrupadas_por_pmcp',
    jsonb_agg(
        jsonb_build_object(
            'id', gsc.id,
            'pmcp_id', gsc.pmcp_id,
            'pmcp_es_origen_del_grupo', gsc.pmcp_es_origen_del_grupo,
            'solicitudes', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'solicitud_id', sv.id,
                        'pasajero_id', sv.pasajero_id,
                        'origen_lat', sv.origen_lat,
                        'origen_lon', sv.origen_lon,
                        'destino_lat', sv.destino_lat,
                        'destino_lon', sv.destino_lon
                    )
                )
                FROM solicitudes_en_grupo_candidato sgc
                JOIN solicitudes_viaje sv ON sgc.solicitud_viaje_id = sv.id
                WHERE sgc.grupo_candidato_id = gsc.id
            )
        )
    )
) AS resultado
FROM grupos_solicitudes_candidatos gsc
WHERE gsc.estado_procesamiento = 'nuevo_grupo';
            `);

    const data2 = await pool.query(`
      select cad.conductor_id, cad.ubicacion_actual_lat,cad.ubicacion_actual_lat,cad.ubicacion_actual_lon,c.capacidad_de_pasajeros
from conductores as c inner join conductores_activos_disponibles as cad
on c.id=cad.conductor_id
            `);

    const input1 = data1.rows[0]?.resultado;
    
    // Verificar que haya datos para procesar
    if (!input1 || !input1.solicitudes_agrupadas_por_pmcp) {
      console.log("No hay nuevos grupos para procesar");
      return;
    }
    
    const input2 = data2.rows;
    
    // Verificar que haya conductores disponibles
    if (!input2 || input2.length === 0) {
      console.log("No hay conductores disponibles para generar combinaciones");
      return;
    }
    
    await combinaciones(pool, input1.solicitudes_agrupadas_por_pmcp, input2);
  } catch (error) {
    console.log("Error al obtener las combinaciones:", error);
  }
};

