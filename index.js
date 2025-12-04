// index.js - Archivo principal de inicialización CORREGIDO
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import middlewares from './middlewares/index.js';
import routes from './routes/index.js';
import modules from './modules/index.js';

class Application {
    constructor() {
        this.app = express();
        this.server = createServer(this.app); // ← SERVER HTTP para Socket.IO
        // Limitar orígenes permitidos para Socket.IO vía env `CORS_ORIGINS` (comma-separated)
        const allowedOrigins = process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
            : ['http://localhost:3000'];

        this.io = new Server(this.server, {
            cors: {
                origin: allowedOrigins,
                methods: ["GET", "POST"],
                credentials: true
            }
        }); // ← INICIALIZAR SOCKET.IO (origins restringidos)
        this.port = process.env.PORT || 3000;
    }

    async initialize() {
        console.log('🚀 Iniciando aplicación Sticker Rueda y Gana...');

        try {
            // 1. 🛡️ Inicializar middlewares (SESIONES PRIMERO)
            await middlewares.initialize(this.app);

            // 2. 📦 Inicializar módulos (PASAR io)
            await modules.initialize(this.io); // ← Pasar io a los módulos

            // 3. 🛣️ Inicializar rutas
            await routes.initialize(this.app, modules, middlewares);

            // 4. 🔌 Configurar Socket.IO
            this.setupSocketIO();

            // 5. ▶️ Iniciar servidor
            this.startServer();

            return { app: this.app, io: this.io };

        } catch (error) {
            console.error('❌ Error fatal inicializando aplicación:', error);
            throw error;
        }
    }

    setupSocketIO() {
        // Configurar eventos de Socket.IO
        this.io.on('connection', (socket) => {
            console.log('🔌 Cliente conectado via Socket.IO:', socket.id);

            // Emitir estado inicial de WhatsApp
            const whatsappModule = modules.getModule('whatsapp');
            if (whatsappModule) {
                const estado = whatsappModule.verificarConexion();
                socket.emit('whatsapp_status', {
                    status: estado,
                    message: 'Conexión establecida'
                });
            }

            // Enviar confirmación de conexión
            socket.emit('connected', {
                message: 'Conectado al servidor',
                socketId: socket.id,
                timestamp: new Date().toISOString()
            });

            socket.on('disconnect', (reason) => {
                console.log('🔌 Cliente desconectado:', socket.id, 'Razón:', reason);
            });

            socket.on('error', (error) => {
                console.error('❌ Error en Socket.IO:', error);
            });
        });

        console.log('✅ Socket.IO configurado correctamente');
    }

    startServer() {
        // Usar this.server en lugar de this.app.listen
        this.server.listen(this.port, () => {
            console.log(`\n🎉 Servidor ejecutándose en puerto ${this.port}`);
            console.log(`📊 Panel Admin: http://localhost:${this.port}/admin`);
            console.log(`🔍 Health Check: http://localhost:${this.port}/health`);
            console.log(`ℹ️  Info: http://localhost:${this.port}/info`);
            console.log(`🔌 Socket.IO: http://localhost:${this.port}/socket.io/`);
            console.log('\n🛡️  Sistema de autenticación ACTIVADO');
        });

        // Manejo graceful de shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    shutdown() {
        console.log('\n🔴 Apagando servidor gracefulmente...');
        this.io?.close(); // Cerrar Socket.IO
        this.server?.close(() => {
            console.log('✅ Servidor apagado correctamente');
            process.exit(0);
        });
    }
}

// Inicializar y exportar la aplicación
async function initializeApp() {
    const app = new Application();
    return await app.initialize();
}

export { initializeApp };
