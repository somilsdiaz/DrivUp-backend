// server.js
import express from 'express';
import { config } from 'dotenv'; // Para variables de entorno
import pg from 'pg';
import cors from 'cors'; // Importar CORS
import http from 'http';
import { Server } from 'socket.io'; // Importar socket.io

// Importar rutas
import usuariosRoutes from './routes/usuarios.js';
import contactosRoutes from './routes/contactos.js';
import mensajesRoutes from './routes/mensajes.js';
import conductoresRoutes from './routes/conductores.js';


config();

const app = express();
//configuración de Socket.io
const server = http.createServer(app); //crear servidor http
//crear instancia de socket.io
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'https://drivup.onrender.com'], //permitir conexiones desde localhost y el dominio de la app
        methods: ['GET', 'POST'], //permitir metodos GET y POST
        allowedHeaders: ['Content-Type', 'Authorization'] //permitir encabezados de contenido y autorización
    }
});

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl:true
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://drivup.onrender.com'],
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization'
}));
app.use(express.json()); // Para analizar cuerpos de solicitud en formato JSON

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('¡API de DrivUp esta funcionando!');
});

// Usar rutas
app.use('/', usuariosRoutes(pool));
app.use('/', contactosRoutes(pool));
app.use('/', mensajesRoutes(pool, io));
app.use('/', conductoresRoutes(pool));
//app.use('/noticias/img', express.static('public/noticias/img'));

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));