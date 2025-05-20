function getCombinations(arr, min,lon) {
   const results = [];
  for(let k=min;k<=lon;k++){
    

  function backtrack(start, combo) {
    if (combo.length === k) {
      results.push({pasajeros_participantes:[...combo],capacidad_utilizada:k});
      return;
    }

    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }

  backtrack(0, []);
 
  }
  return results;
}

async function combinaciones_viajes_propuestas(pool,obj){
   try{
  for(let i in obj.combinaciones){
       const query=`
    INSERT INTO combinaciones_viaje_propuestas (
    grupo_candidato_id,
    numero_pasajeros_en_combinacion,
    estado_procesamiento
) VALUES ($1,$2,$3)
 returning id`;
     
    
      const values = [obj.grupo_candidato_id, obj.combinaciones[i].capacidad_utilizada, 'optimizacion_pendiente'];
      let id=await pool.query(query, values);

   for(let j in obj.combinaciones[i].pasajeros_participantes){

      const query2=`
    INSERT INTO solicitudes_en_combinacion_propuesta (
    combinacion_propuesta_id,
    solicitud_viaje_id
    ) VALUES ($1,$2)`;

       const values2 = [id.rows[0].id, obj.combinaciones[i].pasajeros_participantes[j].solicitud_id];
      await pool.query(query2, values2);
    
       }
  
}
  }catch(error){
    console.log("Error al crear las combinaciones:", error);
  }
 
}

async function update(pool,id){
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

async function combinaciones(pool,grupos,conductores){

 const min=obtenerCapacidadMinima(conductores);
  const max=obtenerCapacidadMaxima(conductores);
 let combi;
    for(let j=0;j<grupos.length;j++){
        if(grupos[j].solicitudes!==null && grupos[j].solicitudes.length>min){
            combi={
          grupo_candidato_id: grupos[j].id,
          pmcp_id: grupos[j].pmcp_id,
          pmcp_es_origen_del_grupo: grupos[j].pmcp_es_origen_del_grupo,
          combinaciones: getCombinations(grupos[j].solicitudes,min,max),
        };
        await combinaciones_viajes_propuestas(pool,combi);
        }
       

         update(pool,grupos[j].id);
       
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
             'id',gsc.id,
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
FROM grupos_solicitudes_candidatos gsc;
            `);
 
     const data2 = await pool.query(`
      select cad.conductor_id, cad.ubicacion_actual_lat,cad.ubicacion_actual_lat,cad.ubicacion_actual_lon,c.capacidad_de_pasajeros
from conductores as c inner join conductores_activos_disponibles as cad
on c.id=cad.conductor_id
            `);
          
        const input1= data1.rows[0].resultado;
        const input2= data2.rows;
       await combinaciones(pool,input1.solicitudes_agrupadas_por_pmcp,input2);
    } catch (error) {
      console.log("Error al obtener las combinaciones:", error);
    }
  };

