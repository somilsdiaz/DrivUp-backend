import express from "express";
const router = express.Router();

export default function noticiasRoutes(pool) {

    router.get('/noticias', async (req, res) => {
        const noticias = await pool.query("SELECT * FROM noticias ORDER BY date DESC");
        res.json(noticias.rows);
    });
    
    router.get('/noticias/:id', async (req, res) => {
        const { id } = req.params;
        const noticia = await pool.query("SELECT * FROM noticias WHERE id = $1", [id]);
        if (noticia.rows.length === 0) return res.status(404).json({ message: "Noticia no encontrada" });
        res.json(noticia.rows[0]);
    });


    return router;
}