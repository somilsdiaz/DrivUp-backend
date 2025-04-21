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
                año_del_vehiculo,
                color_del_vehiculo,
                placa_del_vehiculo,
                Capacidad_de_pasajeros
            } = req.body;


            const user_id = req.user.id;

            // Accede a los archivos subidos
            const foto_de_perfil = req.files['foto_de_perfil']?.[0]?.filename || null;
            const tarjeta_de_propiedad_vehicular = JSON.stringify(req.files['tarjeta_de_propiedad_vehicular']?.map(f => f.filename) || []);
            const seguro_del_vehiculo = JSON.stringify(req.files['seguro_del_vehiculo']?.map(f => f.filename) || []);
            const foto_de_licencia = JSON.stringify(req.files['foto_de_licencia']?.map(f => f.filename) || []);
            
            //debug
            console.log("user_id:", user_id);
            console.log("req.body:", req.body);
            console.log("foto_de_perfil:", foto_de_perfil);
            console.log("tarjeta_de_propiedad_vehicular:", tarjeta_de_propiedad_vehicular);
            console.log("seguro_del_vehiculo:", seguro_del_vehiculo);
            console.log("foto_de_licencia:", foto_de_licencia);

            // Validar que todos los campos obligatorios estén presentes
            if (!licencia_de_conducir || !fecha_de_vencimiento || !foto_de_perfil || !marca_de_vehiculo || !modelo_de_vehiculo || !año_del_vehiculo || !color_del_vehiculo || !placa_del_vehiculo || !Capacidad_de_pasajeros || !tarjeta_de_propiedad_vehicular || !seguro_del_vehiculo || !foto_de_licencia) {
                return res.status(400).json({ message: 'Todos los campos obligatorios deben estar llenos.' });
            }

            try {
                const result = await pool.query(
                    `INSERT INTO conductores (
                user_id,
                licencia_de_conducir,
                fecha_de_vencimiento,
                foto_de_perfil,
                marca_de_vehiculo,
                modelo_de_vehiculo,
                año_del_vehiculo,
                color_del_vehiculo,
                placa_del_vehiculo,
                Capacidad_de_pasajeros,
                tarjeta_de_propiedad_vehicular,
                seguro_del_vehiculo,
                foto_de_licencia
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
              ) RETURNING *`,
                    [
                        user_id,
                        licencia_de_conducir,
                        fecha_de_vencimiento,
                        foto_de_perfil,
                        marca_de_vehiculo,
                        modelo_de_vehiculo,
                        año_del_vehiculo,
                        color_del_vehiculo,
                        placa_del_vehiculo,
                        Capacidad_de_pasajeros,
                        tarjeta_de_propiedad_vehicular,
                        seguro_del_vehiculo,
                        foto_de_licencia
                    ]
                );

                return res.status(201).json({
                    message: 'Conductor registrado exitosamente.',
                    conductor: result.rows[0]
                });
            } catch (error) {
                console.error('Error al registrar conductor:', error);
                return res.status(500).json({ message: 'Error interno del servidor.' });
            }
        });

    // Ruta para obtener los conductores
    router.get('/conductores', async (req, res) => {
        try {
            const conductores = await pool.query(`
             SELECT
                 conductores.id,
                 conductores.user_id,
                 conductores.licencia_de_conducir,
                 conductores.fecha_de_vencimiento,
                 conductores.foto_de_perfil,
                 conductores.marca_de_vehiculo,
                 conductores.modelo_de_vehiculo,
                 conductores.año_del_vehiculo,
                 conductores.color_del_vehiculo,
                 conductores.placa_del_vehiculo,
                 conductores.capacidad_de_pasajeros,
                 conductores.tarjeta_de_propiedad_vehicular,
                 conductores.seguro_del_vehiculo,
                 conductores.foto_de_licencia,
                 conductores.created_at
             FROM
                 conductores                    
                `);
            res.json(conductores.rows);
        } catch (error) {
            console.error("Error al obtener conductores:", error);
            res.status(500).json({ message: "Error interno del servidor" });
        }


    });

    return router;


}