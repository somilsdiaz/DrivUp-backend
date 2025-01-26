// server.js
import express from 'express';
import { config } from 'dotenv'; // Para variables de entorno
import pg from 'pg';
import cors from 'cors'; // Importar CORS

// Importar rutas
import usuariosRoutes from './routes/usuarios.js';


config();

const app = express();
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, // database_URL es la variable de entorno
   // ssl:true// when is local, development environment
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5174', 'https://unibus.onrender.com'],
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization'
}));
app.use(express.json()); // Para analizar cuerpos de solicitud en formato JSON

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('¡API de UniBus esta funcionando!');
});

// Usar rutas
app.use('/', usuariosRoutes(pool));


// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));