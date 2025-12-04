// modules/utils.js - UTILIDADES
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UtilsModule {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        this.initialized = true;
        return this;
    }

    // Guardar datos en JSON
    saveJSON(filepath, data) {
        try {
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Error guardando JSON:', error);
            return false;
        }
    }

    // Cargar datos desde JSON
    loadJSON(filepath) {
        try {
            if (!fs.existsSync(filepath)) return null;
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch (error) {
            console.error('❌ Error cargando JSON:', error);
            return null;
        }
    }

    // Formatear dinero
    formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP'
        }).format(amount);
    }

    // Validar número de WhatsApp
    normalizeNumber(number) {
        return number.replace(/\D/g, '').replace(/^57/, '');
    }

    // Logging
    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;

        console.log(logMessage);

        // Guardar en archivo
        const logFile = path.join(__dirname, '../logs/app.log');
        fs.appendFileSync(logFile, logMessage + '\n');
    }
}

export default UtilsModule;
