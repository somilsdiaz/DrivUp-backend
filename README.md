# DrivUp Backend

API RESTful para la aplicación DrivUp, que facilita la conexión entre conductores y pasajeros, permitiendo la gestión de usuarios, conductores, contactos y mensajería en tiempo real.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node->=18.x-brightgreen.svg)
![Express](https://img.shields.io/badge/express-^4.21.2-lightgrey.svg)

## Tabla de Contenidos

- [Características](#características)
- [Tecnologías](#tecnologías)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Endpoints API](#endpoints-api)
- [Eventos Socket.io](#socketio-events)
- [Estructura de la Base de Datos](#estructura-de-la-base-de-datos)
- [Seguridad](#seguridad)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Características

- **Gestión de Usuarios**: Registro, autenticación y perfiles de usuario
- **Sistema de Conductores**: Registro y gestión de conductores con sus vehículos
- **Gestión de Contactos**: Sistema para recibir consultas y sugerencias de usuarios
- **Mensajería en Tiempo Real**: Comunicación instantánea entre usuarios mediante Socket.io
- **Autenticación Segura**: Sistema JWT para protección de rutas y recursos
- **Almacenamiento de Archivos**: Subida y gestión de imágenes y documentos

## Tecnologías

- **Node.js**: Entorno de ejecución JavaScript del lado del servidor
- **Express.js**: Framework web para Node.js
- **Socket.io**: Biblioteca para comunicación bidireccional en tiempo real
- **PostgreSQL**: Sistema de gestión de base de datos relacional
- **JWT**: JSON Web Tokens para autenticación
- **bcrypt**: Encriptación segura de contraseñas
- **Multer**: Middleware para manejo de subida de archivos

## Requisitos Previos

- Node.js >= 18.x
- PostgreSQL >= 13.x
- npm o pnpm como gestor de paquetes

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/somilsdiaz/DrivUp-backend.git
cd DrivUp-backend
```

2. Instalar dependencias:
```bash
npm install
```

## Configuración

1. Crear un archivo `.env` en la raíz del proyecto con la siguiente información:
```
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/nombre_db
SECRET_KEY=tu_clave_secreta_para_jwt
PORT=5000
```

2. Asegúrate de que la base de datos PostgreSQL esté configurada con las tablas necesarias. 

3. Crea la carpeta `uploads` en la raíz del proyecto para almacenar archivos subidos:
```bash
mkdir uploads
```

## Uso

Para iniciar el servidor en modo desarrollo:

```bash
node server.js
```

## Endpoints API

### Usuarios

- `POST /registro` - Registrar un nuevo usuario
- `POST /login` - Autenticar usuario y generar token JWT
- `GET /usuario/:userId` - Obtener información de un usuario específico
- `GET /usuarios/:userId/role` - Obtener el rol de un usuario
- `GET /usuario/:userId/foto-perfil` - Obtener la foto de perfil de un usuario

### Conductores

- `POST /Registro-Conductor` - Registrar un usuario como conductor
- `PUT /configuracion-conductores-viaje` - Actualizar preferencias de viaje de un conductor
- `GET /conductor-preferencias` - Obtener preferencias de viaje del conductor autenticado
- `GET /conductores` - Obtener todos los conductores registrados

### Mensajería

- `GET /conversations/:userId` - Obtener todas las conversaciones de un usuario
- `GET /conversations/:conversationId/messages` - Obtener mensajes de una conversación
- `POST /conversations` - Crear nueva conversación
- `POST /messages` - Enviar nuevo mensaje

### Contactos

- `POST /contactos` - Registrar un nuevo contacto/consulta

## Socket.io Events

### Cliente → Servidor
- `authenticate` - Autenticar usuario en el socket
- `send_message` - Enviar mensaje
- `mark_as_read` - Marcar mensajes como leídos

### Servidor → Cliente
- `new_message` - Notificar nuevo mensaje
- `message_sent` - Confirmar envío de mensaje
- `messages_read` - Notificar mensajes leídos

## Estructura de la Base de Datos

El sistema utiliza PostgreSQL con las siguientes tablas principales:

- **usuarios**: Almacena información de usuarios registrados
- **conductores**: Almacena información de usuarios registrados como conductores
- **conversations**: Almacena las conversaciones entre usuarios
- **messages**: Almacena los mensajes enviados en las conversaciones
- **contactos**: Almacena las consultas y sugerencias de los usuarios

## Seguridad

- Contraseñas encriptadas mediante bcrypt
- Autenticación basada en JWT
- Protección de rutas mediante middleware de autenticación
- Validación de datos de entrada en todas las rutas

## Contribuir

1. Haz un fork del repositorio
2. Crea una rama para tu funcionalidad: `git checkout -b feature/nueva-funcionalidad`
3. Realiza tus cambios y haz commit: `git commit -m 'Agrega nueva funcionalidad'`
4. Empuja tus cambios a tu repositorio: `git push origin feature/nueva-funcionalidad`
5. Crea un Pull Request

## Licencia

Este proyecto está licenciado bajo la [Licencia MIT](LICENSE). 