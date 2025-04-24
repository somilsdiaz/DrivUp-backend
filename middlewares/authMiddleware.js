import jwt from 'jsonwebtoken';
import { config } from 'dotenv'; // Para variables de entorno


config();

export function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token no proporcionado." });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY); // o tu clave secreta
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token inválido." });
    }
}