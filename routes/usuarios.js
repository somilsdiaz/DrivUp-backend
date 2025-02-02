import express from 'express';
const router = express.Router();

export default function usuariosRoutes(pool) {

       // Ruta para registrar un usuario
       router.post('/registro', async (req, res) => {
        const {
            identificacion,
            nombre,
            apellidos,
            tipoIdentificacion,
            fechaNacimiento,
            universidad,
            ciudadResidencia,
            email,
            password
        } = req.body;

        // Validar que todos los campos requeridos estén presentes
        if (!identificacion || !nombre || !apellidos || !tipoIdentificacion || !fechaNacimiento || !universidad || !ciudadResidencia || !email || !password) {
            return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
        }

        try {
            // Insertar el usuario en la base de datos
            const query = `
                INSERT INTO usuarios (
                    identificacion, nombre, apellidos, tipo_identificacion, fecha_nacimiento, universidad, ciudad_residencia, email, password
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `;

            const values = [
                identificacion,
                nombre,
                apellidos,
                tipoIdentificacion,
                fechaNacimiento,
                universidad,
                ciudadResidencia,
                email,
                password // Nota: Asegúrate de encriptar las contraseñas antes de almacenarlas
            ];

            await pool.query(query, values);

            res.status(201).json({ message: 'Usuario registrado exitosamente.' });
        } catch (error) {
            console.error('Error al registrar el usuario:', error);
            res.status(500).json({ message: 'Ocurrió un error al registrar el usuario.' });
        }
    });

    return router;
}