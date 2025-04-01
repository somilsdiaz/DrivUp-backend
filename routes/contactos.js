import express from 'express';


const router = express.Router();

export default function contactosRoutes(pool) {
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

            const query = `
                INSERT INTO contactos (
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
