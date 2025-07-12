// migrate.js
const fs = require('fs').promises;
const path = require('path');

async function createModularStructure() {
    console.log('🚀 Iniciando migración a arquitectura modular...');
    
    try {
        // Crear todas las carpetas necesarias
        const folders = [
            'src',
            'src/routes',
            'src/controllers', 
            'src/services',
            'src/services/scraping',
            'src/services/scraping/extractors',
            'src/services/scraping/utils',
            'src/services/search',
            'src/services/search/filters',
            'src/services/search/processors',
            'src/services/mortgage',
            'src/services/mortgage/cmf',
            'src/services/mortgage/analysis',
            'src/utils',
            'src/middleware',
            'logs',
            'tests'
        ];
        
        for (const folder of folders) {
            await fs.mkdir(folder, { recursive: true });
            console.log(`✅ Creada carpeta: ${folder}`);
        }
        
        // Crear archivo .gitkeep en logs para que se trackee la carpeta
        await fs.writeFile('logs/.gitkeep', '');
        
        console.log('🎉 Estructura base creada exitosamente!');
        console.log('');
        console.log('📁 Estructura creada:');
        console.log('property-scraper-api/');
        console.log('├── src/');
        console.log('│   ├── routes/');
        console.log('│   ├── controllers/');
        console.log('│   ├── services/');
        console.log('│   │   ├── scraping/');
        console.log('│   │   ├── search/');
        console.log('│   │   └── mortgage/');
        console.log('│   ├── utils/');
        console.log('│   └── middleware/');
        console.log('├── logs/');
        console.log('└── tests/');
        console.log('');
        console.log('📝 Próximos pasos:');
        console.log('   1. Implementar server.js');
        console.log('   2. Crear utilidades básicas');
        console.log('   3. Migrar funcionalidades una por una');
        
    } catch (error) {
        console.error('❌ Error creando estructura:', error.message);
        process.exit(1);
    }
}

// Ejecutar la migración
createModularStructure();