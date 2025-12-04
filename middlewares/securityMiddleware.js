// middlewares/securityMiddleware.js - SEGURIDAD Y DETECCIÓN DE DUPLICADOS
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecurityMiddleware {
    constructor() {
        this.uploadedFiles = new Map(); // Cache de archivos subidos
        this.fileHashes = new Map(); // MD5 de archivos procesados
        this.initialized = false;
    }

    async initialize(app, modules) {
        this.modules = modules;

        // Limpiar cache cada hora
        setInterval(() => {
            this.cleanupCache();
        }, 60 * 60 * 1000);

        this.initialized = true;
        console.log('🛡️  SecurityMiddleware inicializado');
    }

    // 🔍 Verificar si archivo ya fue procesado
    async checkDuplicateFile(fileBuffer, fileName, userNumber) {
        try {
            // Generar hash MD5 del archivo
            const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
            const fileKey = `${userNumber}_${fileHash}`;

            // Verificar en cache de memoria
            if (this.fileHashes.has(fileKey)) {
                console.log(`🚫 Archivo duplicado detectado: ${fileName} para usuario ${userNumber}`);
                return true;
            }

            // Verificar en sistema de archivos
            const comprobantesDir = path.join(__dirname, '../comprobantes');
            if (fs.existsSync(comprobantesDir)) {
                const files = fs.readdirSync(comprobantesDir);
                const existingFile = files.find(f => f.includes(userNumber) && this.getFileHash(path.join(comprobantesDir, f)) === fileHash);

                if (existingFile) {
                    console.log(`🚫 Archivo ya existe en sistema: ${existingFile}`);
                    return true;
                }
            }

            // Agregar a cache
            this.fileHashes.set(fileKey, {
                timestamp: Date.now(),
                fileName: fileName,
                userNumber: userNumber
            });

            return false;

        } catch (error) {
            console.error('❌ Error verificando duplicados:', error);
            return false;
        }
    }

    // 📁 Obtener hash de archivo existente
    getFileHash(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                return crypto.createHash('md5').update(fileBuffer).digest('hex');
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    // 🧹 Limpiar cache antiguo
    cleanupCache() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        for (const [key, data] of this.fileHashes.entries()) {
            if (now - data.timestamp > oneHour) {
                this.fileHashes.delete(key);
            }
        }

        console.log(`🧹 Cache limpiado. Elementos restantes: ${this.fileHashes.size}`);
    }

    // 🔒 Verificar usuario bloqueado
    isUserBlocked(userNumber) {
        try {
            const bloqueadosDir = path.join(__dirname, '../usuarios_bloqueados');
            const bloqueadoFile = path.join(bloqueadosDir, `${userNumber}.json`);

            return fs.existsSync(bloqueadoFile);
        } catch (error) {
            return false;
        }
    }

    // 📝 Registrar intento de subida
    logUploadAttempt(userNumber, fileName, success = true, reason = '') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            userNumber: userNumber,
            fileName: fileName,
            success: success,
            reason: reason
        };

        // Guardar en archivo de log
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logFile = path.join(logsDir, 'upload_attempts.log');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

        if (!success) {
            console.log(`🚫 Intento de subida bloqueado - Usuario: ${userNumber}, Archivo: ${fileName}, Razón: ${reason}`);
        }
    }
}

export default SecurityMiddleware;
