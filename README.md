# DrivUp Backend

API para la aplicación DrivUp, que permite la gestión de usuarios, contactos y mensajería en tiempo real.

## Características

- Gestión de usuarios
- Gestión de contactos
- Sistema de mensajería en tiempo real con Socket.io
- Base de datos PostgreSQL

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/somilsdiaz/DrivUp-backend
cd DrivUp-backend
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Crear un archivo `.env` con:
```
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/nombre_db
JWT_SECRET=tu_clave_secreta
```

## Uso

Iniciar servidor:
```bash
node server.js
```

## Endpoints API

### Mensajería

- `GET /conversations/:userId` - Obtener todas las conversaciones de un usuario
- `GET /conversations/:conversationId/messages` - Obtener mensajes de una conversación
- `POST /conversations` - Crear nueva conversación
- `POST /messages` - Enviar nuevo mensaje

## Socket.io Events

### Cliente → Servidor
- `authenticate` - Autenticar usuario en el socket
- `send_message` - Enviar mensaje
- `mark_as_read` - Marcar mensajes como leídos

### Servidor → Cliente
- `new_message` - Notificar nuevo mensaje
- `message_sent` - Confirmar envío de mensaje
- `messages_read` - Notificar mensajes leídos

## Tecnologías utilizadas

- Node.js
- Express.js
- Socket.io
- PostgreSQL
- CORS
- JWT para autenticación 