// middlewares/rateLimitMiddleware.js - RATE LIMITING
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RateLimitMiddleware {
    constructor() {
        this.userUploads = new Map(); // Contador de subidas por usuario
        this.blockedUsers = new Map(); // Usuarios bloqueados temporalmente
        this.initialized = false;
    }

    async initialize(app, modules) {
        this.modules = modules;

        // Resetear contadores cada hora
        setInterval(() => {
            this.resetCounters();
        }, 60 * 60 * 1000);

        this.initialized = true;
        console.log('🚦 RateLimitMiddleware inicializado');
    }

    // 🚦 Verificar rate limit para usuario
    async checkRateLimit(userNumber, action = 'upload') {
        try {
            // Verificar si está bloqueado permanentemente
            if (this.isPermanentlyBlocked(userNumber)) {
                return { allowed: false, reason: 'Usuario bloqueado permanentemente' };
            }

            // Verificar bloqueo temporal
            if (this.blockedUsers.has(userNumber)) {
                const blockData = this.blockedUsers.get(userNumber);
                if (Date.now() - blockData.timestamp < blockData.duration) {
                    return { allowed: false, reason: `Usuario bloqueado temporalmente. Intente en ${Math.ceil((blockData.duration - (Date.now() - blockData.timestamp)) / 60000)} minutos` };
                } else {
                    this.blockedUsers.delete(userNumber); // Desbloquear
                }
            }

            // Inicializar contador si no existe
            if (!this.userUploads.has(userNumber)) {
                this.userUploads.set(userNumber, {
                    uploads: 0,
                    lastUpload: 0,
                    firstUpload: Date.now()
                });
            }

            const userData = this.userUploads.get(userNumber);
            const now = Date.now();

            // 📊 Límites configurados
            const limits = {
                uploadsPerHour: 10,    // Máximo 10 subidas por hora
                uploadsPerMinute: 3,   // Máximo 3 subidas por minuto
                cooldownBetweenUploads: 10000 // 10 segundos entre subidas
            };

            // ⏰ Verificar cooldown entre subidas
            if (now - userData.lastUpload < limits.cooldownBetweenUploads) {
                return {
                    allowed: false,
                    reason: `Espere ${Math.ceil((limits.cooldownBetweenUploads - (now - userData.lastUpload)) / 1000)} segundos antes de otra subida`
                };
            }

            // 📈 Verificar límite por minuto
            const minuteAgo = now - 60000;
            if (userData.lastUpload > minuteAgo && userData.uploads >= limits.uploadsPerMinute) {
                this.blockUserTemporarily(userNumber, 5 * 60000); // Bloquear 5 minutos
                return { allowed: false, reason: 'Límite de subidas por minuto excedido. Bloqueado por 5 minutos.' };
            }

            // 📈 Verificar límite por hora
            const hourAgo = now - 3600000;
            if (userData.firstUpload > hourAgo && userData.uploads >= limits.uploadsPerHour) {
                this.blockUserTemporarily(userNumber, 30 * 60000); // Bloquear 30 minutos
                return { allowed: false, reason: 'Límite de subidas por hora excedido. Bloqueado por 30 minutos.' };
            }

            // ✅ Actualizar contadores
            userData.uploads++;
            userData.lastUpload = now;

            return { allowed: true };

        } catch (error) {
            console.error('❌ Error en rate limit:', error);
            return { allowed: false, reason: 'Error interno' };
        }
    }

    // 🔒 Bloquear usuario temporalmente
    blockUserTemporarily(userNumber, duration = 5 * 60000) {
        this.blockedUsers.set(userNumber, {
            timestamp: Date.now(),
            duration: duration,
            reason: 'Rate limit excedido'
        });

        console.log(`🚫 Usuario ${userNumber} bloqueado por ${duration / 60000} minutos`);

        // Guardar en log
        this.logBlockAction(userNumber, duration);
    }

    // 🔒 Verificar bloqueo permanente
    isPermanentlyBlocked(userNumber) {
        try {
            const bloqueadosDir = path.join(__dirname, '../usuarios_bloqueados');
            const bloqueadoFile = path.join(bloqueadosDir, `${userNumber}.json`);
            return fs.existsSync(bloqueadoFile);
        } catch (error) {
            return false;
        }
    }

    // 🧹 Resetear contadores periódicamente
    resetCounters() {
        const now = Date.now();
        const oneHour = 3600000;

        for (const [userNumber, userData] of this.userUploads.entries()) {
            if (now - userData.firstUpload > oneHour) {
                this.userUploads.delete(userNumber);
            }
        }

        console.log(`🔄 Contadores de rate limit reseteados. Usuarios activos: ${this.userUploads.size}`);
    }

    // 📝 Log de bloqueos
    logBlockAction(userNumber, duration) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            userNumber: userNumber,
            action: 'rate_limit_block',
            duration: duration,
            durationMinutes: duration / 60000
        };

        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logFile = path.join(logsDir, 'rate_limit_blocks.log');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    // 📊 Obtener estadísticas de usuario
    getUserStats(userNumber) {
        if (this.userUploads.has(userNumber)) {
            const data = this.userUploads.get(userNumber);
            return {
                uploads: data.uploads,
                lastUpload: new Date(data.lastUpload).toISOString(),
                firstUpload: new Date(data.firstUpload).toISOString()
            };
        }
        return null;
    }
}

export default RateLimitMiddleware;
