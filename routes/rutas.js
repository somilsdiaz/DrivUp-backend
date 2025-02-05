import express from 'express';
const router = express.Router();

export default function rutas(pool) {
    // Endpoint para obtener las rutas
    router.get('/rutas', async (req, res) => {
        try {
            // Consulta SQL para obtener las rutas con sus empresas y destinos
            const query = `
                SELECT 
                    r.id AS ruta_id,
                    r.nombre AS ruta_nombre,
                    e.nombre AS empresa_nombre,
                    r.tiempo_promedio_viaje,
                    r.primer_despacho,
                    r.ultimo_despacho,
                    r.costo,
                    r.image_url,
                    r.map_url,
                    r.color,
                    r.icon,
                    r.description,
                    array_agg(d.nombre) AS destinos
                FROM rutas r
                JOIN empresas e ON r.empresa_id = e.id
                LEFT JOIN ruta_destinos rd ON r.id = rd.ruta_id
                LEFT JOIN destinos d ON rd.destino_id = d.id
                GROUP BY r.id, e.nombre
            `;

            // Ejecutar la consulta
            const result = await pool.query(query);

            // Transformar los datos para que coincidan con la estructura del frontend
            const busRoutes = result.rows.map(row => ({
                id: row.ruta_id.toString(),
                nombre: row.ruta_nombre,
                empresa: row.empresa_nombre,
                tiempoPromedioViaje: row.tiempo_promedio_viaje,
                primerDespacho: row.primer_despacho,
                ultimoDespacho: row.ultimo_despacho,
                costo: row.costo,
                imageUrl: row.image_url,
                mapUrl: row.map_url,
                theme: {
                    color: row.color,
                    icon: row.icon,
                    description: row.description,
                },
                destinos: row.destinos.filter(destino => destino !== null), // Filtrar destinos nulos
            }));

            // Devolver los datos en formato JSON
            res.status(200).json(busRoutes);
        } catch (error) {
            console.error('Error al obtener las rutas:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    });

    return router;
}