import express from "express";
const router = express.Router();

export default function noticiasRoutes(pool) {

    // Obtener todas las noticias
    router.get('/noticias', async (req, res) => {
        try {
            const noticias = await pool.query("SELECT * FROM noticias ORDER BY date DESC");
            res.json(noticias.rows);
        } catch (error) {
            console.error("Error al obtener noticias:", error);
            res.status(500).json({ message: "Error interno del servidor" });
        }
    });

    // Obtener una noticia por ID
    router.get('/noticias/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (isNaN(id)) {
                return res.status(400).json({ message: "ID no válido" });
            }
            const noticia = await pool.query("SELECT * FROM noticias WHERE id = $1", [id]);
            if (noticia.rows.length === 0) {
                return res.status(404).json({ message: "Noticia no encontrada" });
            }
            res.json(noticia.rows[0]);
        } catch (error) {
            console.error("Error al obtener la noticia:", error);
            res.status(500).json({ message: "Error interno del servidor" });
        }
    });

    return router;
}