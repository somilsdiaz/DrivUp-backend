import express from 'express';

// Mapeo de conexión de socket (para rastrear usuarios en línea)
let userSocketMap = {};

export default function mensajesRoutes(pool, io) {
    const router = express.Router();

    // Configurar manejadores de eventos de socket.io si io está proporcionado
    if (io) {
        io.on('connection', (socket) => {
            console.log('Nuevo cliente conectado');

            // Autenticación de usuario y mapeo de socket
            socket.on('authenticate', (userId) => {
                userSocketMap[userId] = socket.id;
                console.log(`Usuario ${userId} conectado con socket ${socket.id}`);
            });

            // Escuchar para nuevos mensajes
            socket.on('send_message', async (messageData) => {
                try {
                    const { conversationId, senderId, receiverId, messageText } = messageData;

                    // guardar mensaje en la base de datos
                    const result = await pool.query(
                        `INSERT INTO messages (conversation_id, sender_id, receiver_id, message_text)
            VALUES ($1, $2, $3, $4) RETURNING *`,
                        [conversationId, senderId, receiverId, messageText]
                    );

                    const savedMessage = result.rows[0];

                    // actualizar last_message_at en la conversación
                    await pool.query(
                        `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP 
            WHERE id = $1`,
                        [conversationId]
                    );

                    // Emitir el mensaje al receptor si está en línea
                    if (userSocketMap[receiverId]) {
                        io.to(userSocketMap[receiverId]).emit('new_message', savedMessage);
                    }

                    // devolver confirmación al remitente
                    socket.emit('message_sent', savedMessage);
                } catch (error) {
                    console.error('Error sending message:', error);
                    socket.emit('message_error', { error: 'Failed to send message' });
                }
            });

            // Marcar mensajes como leídos
            socket.on('mark_as_read', async (data) => {
                try {
                    const { conversationId, userId } = data;

                    // actualizar mensajes en la base de datos
                    await pool.query(
                        `UPDATE messages 
            SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
            WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
                        [conversationId, userId]
                    );

                    // Notificar al remitente que los mensajes fueron leídos
                    const senderQuery = await pool.query(
                        `SELECT DISTINCT sender_id FROM messages 
            WHERE conversation_id = $1 AND receiver_id = $2`,
                        [conversationId, userId]
                    );

                    const senderId = senderQuery.rows[0]?.sender_id;
                    if (senderId && userSocketMap[senderId]) {
                        io.to(userSocketMap[senderId]).emit('messages_read', { conversationId, readBy: userId });
                    }
                } catch (error) {
                    console.error('Error marking messages as read:', error);
                }
            });

            // Manejar desconexión
            socket.on('disconnect', () => {
                // Eliminar el mapeo de socket cuando el usuario se desconecta
                const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
                if (userId) {
                    delete userSocketMap[userId];
                    console.log(`User ${userId} disconnected`);
                }
            });
        });
    }

    // Obtener todas las conversaciones para un usuario
    router.get('/conversations/:userId', async (req, res) => {
        try {
            const { userId } = req.params;

            const result = await pool.query(
                `SELECT c.id, c.user_id, c.passenger_id, c.last_message_at,
          u1.name AS user_name, 
          CONCAT(u1.last_name, ' ', u1.second_last_name) AS user_last_name,
          u2.name AS passenger_name, 
          CONCAT(u2.last_name, ' ', u2.second_last_name) AS passenger_last_name, 
          (SELECT message_text FROM messages WHERE conversation_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_message,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND receiver_id = $1 AND is_read = FALSE) AS unread_count
        FROM conversations c
        JOIN usuarios u1 ON c.user_id = u1.id
        JOIN usuarios u2 ON c.passenger_id = u2.id
        WHERE c.user_id = $1 OR c.passenger_id = $1
        ORDER BY c.last_message_at DESC`,
                [userId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching conversations:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Obtener mensajes para una conversación específica
    router.get('/conversations/:conversationId/messages', async (req, res) => {
        try {
            const { conversationId } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const offset = (page - 1) * limit;

            const result = await pool.query(
                `SELECT m.*, 
          u1.name AS sender_name,
          CONCAT(u1.last_name, ' ', u1.second_last_name) AS sender_last_name
        FROM messages m
        JOIN usuarios u1 ON m.sender_id = u1.id
        WHERE m.conversation_id = $1
        ORDER BY m.sent_at ASC
        LIMIT $2 OFFSET $3`,
                [conversationId, limit, offset]
            );

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Crear una nueva conversación
    router.post('/conversations', async (req, res) => {
        try {
            const { userId, passengerId } = req.body;

            // Check if conversation already exists
            const existingConversation = await pool.query(
                `SELECT * FROM conversations 
        WHERE (user_id = $1 AND passenger_id = $2) OR (user_id = $2 AND passenger_id = $1)`,
                [userId, passengerId]
            );

            if (existingConversation.rows.length > 0) {
                return res.json(existingConversation.rows[0]);
            }

            // Create new conversation
            const result = await pool.query(
                `INSERT INTO conversations (user_id, passenger_id, last_message_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *`,
                [userId, passengerId]
            );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating conversation:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Enviar un nuevo mensaje
    router.post('/messages', async (req, res) => {
        try {
            const { conversationId, senderId, receiverId, messageText } = req.body;

            const result = await pool.query(
                `INSERT INTO messages (conversation_id, sender_id, receiver_id, message_text, sent_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`,
                [conversationId, senderId, receiverId, messageText]
            );

            // actualizar last_message_at en la conversación
            await pool.query(
                `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP 
        WHERE id = $1`,
                [conversationId]
            );

            // Notificar al receptor a través de socket si está en línea
            if (userSocketMap[receiverId]) {
                io.to(userSocketMap[receiverId]).emit('new_message', result.rows[0]);
            }

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
} 