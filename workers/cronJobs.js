// En cronJobs.js o server.js
const cron = require('node-cron');
const { groupRequests } = require('./workers/bk002_01_groupRequests');
const { generateCombinations } = require('./workers/bk002_02_generateCombinations');
// ... y así sucesivamente

// Ejecutar BK002-01 cada 2 minutos
cron.schedule('*/2 * * * *', async () => {
    console.log('Ejecutando BK002-01: Agrupación de Solicitudes...');
    await groupRequests();
    console.log('BK002-01 completado.');
});

// Ejecutar BK002-02 cada 3 minutos (ajustar tiempos según necesidad y dependencia)
cron.schedule('*/3 * * * *', async () => {
    console.log('Ejecutando BK002-02: Generación de Combinaciones...');
    await generateCombinations();
    console.log('BK002-02 completado.');
});