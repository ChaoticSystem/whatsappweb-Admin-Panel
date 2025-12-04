import { initializeApp } from './index.js';

initializeApp()
    .catch((err) => {
        console.error('❌ Error fatal al iniciar la app:', err);
        process.exit(1);
    });
