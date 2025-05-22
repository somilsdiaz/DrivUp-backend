// server.js
import express from 'express';
import { config } from 'dotenv'; // Para variables de entorno
import pg from 'pg';
import cors from 'cors'; // Importar CORS
import http from 'http';
import { Server } from 'socket.io'; // Importar socket.io
import path from 'path';

// Importar rutas
import usuariosRoutes from './routes/usuarios.js';
import contactosRoutes from './routes/contactos.js';
import mensajesRoutes from './routes/mensajes.js';
import conductoresRoutes from './routes/conductores.js';
import reseñasRoutes from './routes/reseñas.js';
import ruta_Usuario_Routes from './routes/ruta_usuario.js';
import puntosConcentracionRoutes from './routes/Modulo Transporte dinamico/puntos_concentracion.js';
import solicitudesViajeRoutes from './routes/Modulo Transporte dinamico/solicitudes_viaje.js';
import agrupaciones_combinaciones_optimizaciones_Routes from './routes/Modulo Transporte dinamico/agrupaciones_combinaciones_optimizaciones.js';
import visualizacionRuta from './routes/Modulo Transporte dinamico/visualizacionRuta.js';
import listaViajesRoutes from './routes/Modulo Transporte dinamico/listaViajes.js';
import activarConductor from './routes/Modulo Transporte dinamico/activarConductor.js';
import detallesViajeRoutes from './routes/Modulo Transporte dinamico/detalles_viajes.js';


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
    ssl:true,
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

// Exponer la carpeta uploads como pública
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Usar rutas
app.use('/', usuariosRoutes(pool));
app.use('/', contactosRoutes(pool));
app.use('/', mensajesRoutes(pool, io));
app.use('/', conductoresRoutes(pool));
app.use('/', reseñasRoutes(pool));
app.use('/',ruta_Usuario_Routes(pool));
app.use('/', puntosConcentracionRoutes(pool));
app.use('/', solicitudesViajeRoutes(pool));
app.use('/', agrupaciones_combinaciones_optimizaciones_Routes(pool));
app.use('/', visualizacionRuta(pool));
app.use('/', listaViajesRoutes(pool));
app.use('/', activarConductor(pool));   
app.use('/', detallesViajeRoutes(pool));
//app.use('/noticias/img', express.static('public/noticias/img'));

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));