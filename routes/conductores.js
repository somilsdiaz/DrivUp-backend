import express from 'express';
import { verifyToken } from '../middlewares/authMiddleware.js'; // importa tu middleware
import upload from '../middlewares/multerMiddleware.js'; // ← Importas multer


const router = express.Router();



export default function conductoresRoutes(pool) {
    //ruta para registrar un conductor
    router.post('/Registro-Conductor', verifyToken,
        upload.fields([
            { name: 'foto_de_perfil', maxCount: 1 },
            { name: 'tarjeta_de_propiedad_vehicular', maxCount: 5 },
            { name: 'seguro_del_vehiculo', maxCount: 5 },
            { name: 'foto_de_licencia', maxCount: 2 }
        ]),
        async (req, res) => {
            const {
                //Detalles del Vehiculo.
                licencia_de_conducir,
                fecha_de_vencimiento,
                marca_de_vehiculo,
                modelo_de_vehiculo,
                anio_del_vehiculo,
                color_del_vehiculo,
                placa_del_vehiculo,
                Capacidad_de_pasajeros
            } = req.body;
            const user_id = req.user.id;

            // Accede a los archivos procesados por Multer
            const perfilFile = req.files['foto_de_perfil']?.[0]; // Obtiene el objeto archivo
            const tarjetaFiles = req.files['tarjeta_de_propiedad_vehicular'] || []; // Obtiene el array de archivos
            const seguroFiles = req.files['seguro_del_vehiculo'] || []; // Obtiene el array de archivos
            const licenciaFiles = req.files['foto_de_licencia'] || []; // Obtiene el array de archivos

            // Validar que todos los campos obligatorios (texto y archivos) estén presentes
            if (!licencia_de_conducir || !fecha_de_vencimiento ||
                !marca_de_vehiculo || !modelo_de_vehiculo || !anio_del_vehiculo ||
                !color_del_vehiculo || !placa_del_vehiculo || !Capacidad_de_pasajeros ||
                !perfilFile || // Verifica que el objeto archivo exista
                tarjetaFiles.length === 0 || // Verifica que el array no esté vacío
                seguroFiles.length === 0 ||   // Verifica que el array no esté vacío
                licenciaFiles.length === 0    // Verifica que el array no esté vacío
            ) {
                return res.status(400).json({ message: 'Todos los campos obligatorios deben estar llenos.' });
            }


            // validamos y ahora se procesa los nombres de archivo para la DB
            const foto_de_perfil_filename = perfilFile.filename;
            const tarjeta_de_propiedad_filenames = tarjetaFiles.map(f => f.filename);
            const seguro_del_vehiculo_filenames = seguroFiles.map(f => f.filename);
            const foto_de_licencia_filenames = licenciaFiles.map(f => f.filename);

            try {
                const result = await pool.query(
                    `INSERT INTO conductores (
                        user_id, licencia_de_conducir, fecha_de_vencimiento, foto_de_perfil,
                        marca_de_vehiculo, modelo_de_vehiculo, año_del_vehiculo, color_del_vehiculo,
                        placa_del_vehiculo, Capacidad_de_pasajeros, tarjeta_de_propiedad_vehicular,
                        seguro_del_vehiculo, foto_de_licencia
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                    ) RETURNING *`,
                    [
                        user_id, licencia_de_conducir, fecha_de_vencimiento,
                        foto_de_perfil_filename,
                        marca_de_vehiculo, modelo_de_vehiculo, anio_del_vehiculo, color_del_vehiculo,
                        placa_del_vehiculo, Capacidad_de_pasajeros,
                        tarjeta_de_propiedad_filenames,
                        seguro_del_vehiculo_filenames,
                        foto_de_licencia_filenames
                    ]
                );
                return res.status(201).json({
                    message: 'Conductor registrado exitosamente.',
                    conductor: result.rows[0]
                });
            } catch (error) {
                console.error('Error al registrar conductor:', error);
                return res.status(500).json({ message: 'Error interno del servidor al guardar los datos.' });
            }
        });

    // PUT para actualizar la configuración de viaje
    router.put('/configuracion-conductores-viaje', verifyToken, async (req, res) => {
        const {
            origen_aproximado,
            destino_aproximado,
            descripcion
        } = req.body;

        const user_id = req.user.id; // ID del usuario autenticado

        try {
            const query = `
        UPDATE conductores
        SET
            origen_aproximado = COALESCE($1, origen_aproximado), 
            destino_aproximado = COALESCE($2, destino_aproximado),
            descripcion = COALESCE($3, descripcion)
        WHERE user_id = $4
        RETURNING *;
    `;

            const result = await pool.query(query, [
                origen_aproximado || null, // Si no se envía un valor, no actualiza el campo.
                destino_aproximado || null,
                descripcion || null,
                user_id
            ]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Configuración de viaje no encontrada' });
            }

            res.status(200).json(result.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error interno al actualizar la configuración de viaje' });
        }
    });

    router.get('/conductor-preferencias', verifyToken, async (req, res) => {
        try {
            const userId = req.user.id; // Asumiendo que tienes el ID del usuario en el token
            const query = `
                SELECT 
                    conductores.origen_aproximado, 
                    conductores.destino_aproximado, 
                    conductores.descripcion 
                FROM conductores 
                WHERE user_id = $1
            `;

            // Usando await con pool.query
            const { rows } = await pool.query(query, [userId]);

            if (rows.length > 0) {
                res.json(rows[0]); // Retornar solo el primer resultado
            } else {
                res.status(404).json({ message: "No se encontraron datos" });
            }
        } catch (err) {
            console.error("Error al obtener datos:", err);
            res.status(500).json({ message: "Error al obtener datos", error: err.message });
        }
    });

    // Ruta para obtener los conductores
    router.get('/conductores', async (_, res) => {
        try {
            const conductores = await pool.query(`
     SELECT 
    T.id,
    CONCAT_WS(' ', T.name, T.second_name, T.last_name, T.second_last_name) AS nombre_completo,
    T.modelo_de_vehiculo, 
    T.color_del_vehiculo, 
    T.año_del_vehiculo, 
    T.capacidad_de_pasajeros, 
    T.origen_aproximado,
    T.destino_aproximado,
    T.descripcion,
    T.created_at,
    AVG(r.calificacion) AS promedio_calificacion
FROM (
    SELECT 
        c.id, 
        u.name, 
        u.second_name, 
        u.last_name, 
        u.second_last_name, 
        c.modelo_de_vehiculo, 
        c.color_del_vehiculo, 
        c.año_del_vehiculo, 
        c.capacidad_de_pasajeros, 
        c.origen_aproximado,
        c.destino_aproximado,
        c.descripcion,
        c.created_at
    FROM usuarios AS u
    INNER JOIN conductores AS c ON c.user_id = u.id
) AS T
INNER JOIN reseñas AS r ON T.id = r.conductor_id
GROUP BY 
    T.id, 
    nombre_completo, 
    T.modelo_de_vehiculo, 
    T.color_del_vehiculo, 
    T.año_del_vehiculo, 
    T.capacidad_de_pasajeros, 
    T.origen_aproximado,
    T.destino_aproximado,
    T.descripcion,
    T.created_at;
`);
            res.json(conductores.rows);
        } catch (error) {
            console.error("Error al obtener conductores:", error);
            res.status(500).json({ message: "Error interno del servidor" });
        }
    });


   

    return router;
}


