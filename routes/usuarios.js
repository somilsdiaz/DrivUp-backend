import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; // Para generar tokens
import { config } from 'dotenv'; // Para variables de entorno

config();
const router = express.Router();

export default function usuariosRoutes(pool) {
    // Ruta para registrar un usuario
    router.post('/registro', async (req, res) => {
        const {
            name,
            second_name,
            last_name,
            second_last_name,
            document_type,
            document_number,
            email,
            phone_number,
            password,
            accept_data
        } = req.body;

        // Validar que todos los campos obligatorios estén presentes
        if (!name || !last_name || !second_last_name || !document_type || !document_number || !email || !phone_number || !password) {
            return res.status(400).json({ message: 'Todos los campos obligatorios deben estar llenos.' });
        }

        if (accept_data !== true) {
            return res.status(400).json({ message: 'Debe aceptar la política de datos.' });
        }

        const validDocumentTypes = ['cc', 'ti', 'passport', 'ce'];
        if (!validDocumentTypes.includes(document_type.toLowerCase())) {
            return res.status(400).json({ message: 'Tipo de documento no válido.' });
        }

        try {
            // Verificar si el documento ya existe con el mismo tipo
            const checkDocumentQuery = `
            SELECT id FROM usuarios 
            WHERE document_type = $1 AND document_number = $2`;
            const checkDocumentResult = await pool.query(checkDocumentQuery, [document_type, document_number]);

            if (checkDocumentResult.rows.length > 0) {
                return res.status(400).json({ message: 'Este número de documento ya está registrado con este tipo de documento.' });
            }

            // Verificar si el email ya existe
            const checkEmailQuery = `
                        SELECT id FROM usuarios 
                        WHERE email = $1`;
            const checkEmailResult = await pool.query(checkEmailQuery, [email]);

            if (checkEmailResult.rows.length > 0) {
                return res.status(400).json({ message: 'El email ya está registrado.' });
            }


            if (password.length < 8) {
                return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
            }

            // Encriptar la contraseña antes de almacenarla
            let password_hash;
            try {
                password_hash = await bcrypt.hash(password, 10);
            } catch (error) {
                return res.status(500).json({ message: 'Error al encriptar la contraseña.' });
            }


            const query = `
                INSERT INTO usuarios (
                    name, second_name, last_name, second_last_name, document_type, document_number, 
                    email, phone_number, password_hash, accept_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;

            const values = [
                name,
                second_name || null, // Si no se envía, se guarda como NULL
                last_name,
                second_last_name,
                document_type,
                document_number,
                email,
                phone_number,
                password_hash, // Guardar contraseña encriptada
                accept_data
            ];

            await pool.query(query, values);

            res.status(201).json({ message: 'Usuario registrado exitosamente.' });

        } catch (error) {
            if (error.code === '23505') {
                if (error.constraint === 'unique_document') {
                    return res.status(400).json({ message: 'Este documento ya está registrado con este tipo de documento.' });
                }
                if (error.constraint === 'unique_email') {
                    return res.status(400).json({ message: 'El email ya está registrado.' });
                }
            }
            console.error('Error al registrar usuario:', error);
            res.status(500).json({ message: 'Error interno al registrar el usuario.' });
        }
    });

    // Ruta para obtener un usuario específico por su ID
    router.get('/usuario/:userId', async (req, res) => {
        try {
            const userId = parseInt(req.params.userId);
            
            if (isNaN(userId)) {
                return res.status(400).json({ message: "ID de usuario inválido" });
            }
            
            const query = `
                SELECT
                    id,
                    name,
                    second_name,
                    last_name,
                    second_last_name,
                    document_type,
                    document_number,
                    email,
                    phone_number,
                    accept_data,
                    created_at
                FROM
                    usuarios
                WHERE
                    id = $1
            `;
            
            const result = await pool.query(query, [userId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Usuario no encontrado" });
            }
            
            res.json(result.rows[0]);
        } catch (error) {
            console.error("Error al obtener usuario:", error);
            res.status(500).json({ message: "Error interno del servidor" });
        }
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body;

        // Validar que el usuario envió email y contraseña
        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña son requeridos.' });
        }

        try {
            // Buscar usuario en la base de datos por email
            const query = `SELECT * FROM usuarios WHERE email = $1`;
            const result = await pool.query(query, [email]);

            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Credenciales incorrectas.' });
            }

            const usuario = result.rows[0];

            // Comparar la contraseña enviada con la almacenada en la BD
            const passwordMatch = await bcrypt.compare(password, usuario.password_hash);

            if (!passwordMatch) {
                return res.status(401).json({ message: 'Credenciales incorrectas.' });
            }

            // Generar un token JWT
            const token = jwt.sign(
                { id: usuario.id, email: usuario.email },
                process.env.SECRET_KEY, 
                { expiresIn: '2h' }
            );

            res.json({ 
                message: 'Login exitoso', 
                token,
                userId: usuario.id 
            });
        } catch (error) {
            console.error("Error en el login:", error);
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    });

    /**
     * obtener el rol de un usuario por su ID
     * GET /usuarios/:userId/role
     */
    router.get('/usuarios/:userId/role', async (req, res) => {
        try {
            const userId = parseInt(req.params.userId);

            if (isNaN(userId)) {
                return res.status(400).json({ message: "ID de usuario inválido" });
            }

            //el usuario existe en la tabla usuarios?
            const userQuery = 'SELECT id FROM usuarios WHERE id = $1';
            const userResult = await pool.query(userQuery, [userId]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ message: "Usuario no encontrado" });
            }

            // el usuario también existe en la tabla conductores?
            const driverQuery = 'SELECT id FROM conductores WHERE user_id = $1';
            const driverResult = await pool.query(driverQuery, [userId]);

            // determinamos el rol según si existe o no en la tabla conductores
            const role = driverResult.rows.length > 0 ? "conductor y pasajero" : "pasajero";

            return res.status(200).json({
                userId: userId,
                role: role
            });

        } catch (error) {
            console.error("Error al obtener el rol del usuario:", error);
            res.status(500).json({ message: "Error interno del servidor al procesar la solicitud" });
        }
    });

    /**
     * Obtener la foto de perfil de un usuario por su ID
     */
    router.get('/usuario/:userId/foto-perfil', async (req, res) => {
        try {
            const userId = parseInt(req.params.userId);

            if (isNaN(userId)) {
                return res.status(400).json({ message: "ID de usuario inválido" });
            }

            // cnsulta para obtener la foto de perfil del usuario, priorizando la de usuarios
            // y si no existe tomando la de conductores (si el usuario es conductor)
            const query = `
                SELECT
                    COALESCE(u.foto_de_perfil, c.foto_de_perfil) AS foto_de_perfil_final
                FROM
                    usuarios u
                LEFT JOIN
                    conductores c ON u.id = c.user_id
                WHERE
                    u.id = $1
            `;

            const result = await pool.query(query, [userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Usuario no encontrado" });
            }

            // esto si no hayfoto de perfil en ninguna de las dos tablas
            if (!result.rows[0].foto_de_perfil_final) {
                return res.status(404).json({ message: "No se encontró foto de perfil para este usuario" });
            }

            res.json({ 
                userId: userId,
                fotoPerfil: result.rows[0].foto_de_perfil_final 
            });

        } catch (error) {
            console.error("Error al obtener foto de perfil:", error);
            res.status(500).json({ message: "Error interno del servidor al procesar la solicitud" });
        }
    });

    return router;
}

