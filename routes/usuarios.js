import express from 'express';
import bcrypt from 'bcrypt';

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

    return router;
}
