import express from 'express';


const router = express.Router();

export default function usuariosRoutes(pool) {
    // Ruta para registrar un contacto
    router.post('/contactos', async (req, res) => {
        const {
            nombre,
            correo,
            asunto,
            mensaje,
            archivo
        } = req.body;

        // Validar que todos los campos obligatorios estén presentes
        if (!nombre ||  !correo || !asunto || !mensaje) {
            return res.status(400).json({ message: 'Todos los campos obligatorios deben estar llenos.' });
        }


        const validarAsunto = ['Consulta', 'Reportar problema', 'Sugerencia', 'Otros'];
        if (!validarAsunto.includes(asunto)) {
            return res.status(400).json({ message: 'Tipo de asunto no valido' });
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


            const query = `
                INSERT INTO usuarios (
                    nombre, correo, asunto, mensaje, archivo
                ) VALUES ($1, $2, $3, $4, $5)
            `;

            const values = [
            nombre,
            correo,
            asunto,
            mensaje,
            archivo ||null
            ];

            await pool.query(query, values);

            res.status(201).json({ message: 'Contacto registrado exitosamente.' });

        } catch (error) {
            if (error.code === '23505') {
            }
            console.error('Error al registrar contacto:', error);
            res.status(500).json({ message: 'Error interno al registrar el contacto' });
        }
    });

    return router;
}
