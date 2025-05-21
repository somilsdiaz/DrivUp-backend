export async function agruparSolicitudesPorPMCP(pool) {
  try {
    // Obtenemos los conductores disponibles para verificar la capacidad mínima
    const { rows: conductores } = await pool.query(
        `SELECT c.capacidad_de_pasajeros
        FROM conductores AS c
        INNER JOIN conductores_activos_disponibles AS cad
        ON c.id = cad.conductor_id`
    );

    // Si no hay conductores disponibles, no podemos procesar grupos
    if (conductores.length === 0) {
      console.log("No hay conductores disponibles para procesar grupos");
      return;
    }

    // Calcular la capacidad mínima
    const capacidadMinima = Math.min(...conductores.map(c => c.capacidad_de_pasajeros));

    const { rows: solicitudes } = await pool.query(
      `SELECT * FROM solicitudes_viaje WHERE estado = 'pendiente'`
    );

    // Agrupación por PMCP y tipo (origen o destino)
    const grupos = {};

    for (const solicitud of solicitudes) {
      if (solicitud.es_origen_concentracion && solicitud.origen_pmcp_id) {
        const clave = `origen-${solicitud.origen_pmcp_id}`;
        if (!grupos[clave]) grupos[clave] = { pmcp_id: solicitud.origen_pmcp_id, es_origen: true, solicitudes: [] };
        grupos[clave].solicitudes.push(solicitud);
      }

      if (solicitud.es_destino_concentracion && solicitud.destino_pmcp_id) {
        const clave = `destino-${solicitud.destino_pmcp_id}`;
        if (!grupos[clave]) grupos[clave] = { pmcp_id: solicitud.destino_pmcp_id, es_origen: false, solicitudes: [] };
        grupos[clave].solicitudes.push(solicitud);
      }
    }

    // Procesar cada grupo
    for (const clave in grupos) {
      const grupo = grupos[clave];
      
      // Verificar si el grupo tiene al menos la capacidad mínima de solicitudes
      if (grupo.solicitudes.length < capacidadMinima) {
        console.log(`Grupo ${clave} con ${grupo.solicitudes.length} solicitudes es menor que la capacidad mínima (${capacidadMinima}). No se creará el grupo.`);
        continue; // Saltar este grupo y continuar con el siguiente
      }

      // 1. Insertar en grupos_solicitudes_candidatos
      const insertGrupo = await pool.query(
        `INSERT INTO grupos_solicitudes_candidatos (pmcp_id, pmcp_es_origen_del_grupo, estado_procesamiento, created_at, updated_at)
         VALUES ($1, $2, 'nuevo_grupo', NOW(), NOW()) RETURNING id`,
        [grupo.pmcp_id, grupo.es_origen]
      );

      const grupoId = insertGrupo.rows[0].id;

      // 2. Insertar en solicitudes_en_grupo_candidato
      for (const solicitud of grupo.solicitudes) {
        await pool.query(
          `INSERT INTO solicitudes_en_grupo_candidato (grupo_candidato_id, solicitud_viaje_id)
           VALUES ($1, $2)`,
          [grupoId, solicitud.id]
        );

        // 3. Marcar solicitud como "en_agrupacion"
        await pool.query(
          `UPDATE solicitudes_viaje SET estado = 'agrupada', updated_at = NOW() WHERE id = $1`,
          [solicitud.id]
        );
      }
    }

    console.log("Agrupación completada con éxito");
  } catch (error) {
    console.error("Error al agrupar solicitudes:", error);
    throw error;
  }
}