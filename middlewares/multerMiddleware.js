import multer from 'multer';
import path from 'path';

// Configuración de almacenamiento de archivos con multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Definir la carpeta donde se guardarán los archivos
        cb(null, './uploads/');
    },
    filename: (req, file, cb) => {
        // Generar un nombre único para cada archivo
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Crear el middleware de multer
const upload = multer({ storage: storage });

export default upload;