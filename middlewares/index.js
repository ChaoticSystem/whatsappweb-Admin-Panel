// middlewares/index.js
import express from 'express';
import session from 'express-session';
import path from 'path';
import { SESSION_SECRET, requireAuth, requireAdmin } from './auth.js';

class MiddlewareManager {
    constructor() {
        this.middlewares = {};
    }

    async initialize(app, modules) {
        console.log('🛡️ Inicializando middlewares...');

        try {
            // 🔐 Middleware de sesiones (PRIMERO - importante)
            this.setupSessionMiddleware(app);

            // 📊 Middleware de logging
            this.setupLoggingMiddleware(app);

            // 🌐 Middleware de CORS
            this.setupCorsMiddleware(app);

            // 📦 Middleware para parsing JSON
            this.setupBodyParsingMiddleware(app);

            console.log('✅ Todos los middlewares inicializados');
            return this.middlewares;

        } catch (error) {
            console.error('❌ Error inicializando middlewares:', error);
            throw error;
        }
    }

    setupSessionMiddleware(app) {
        app.use(session({
            secret: SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false, // Cambiar a true en producción con HTTPS
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24 horas
            }
        }));

        console.log('✅ Middleware de sesiones configurado');
        this.middlewares.session = true;
    }

    setupBodyParsingMiddleware(app) {
        // Middleware para parsing JSON
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        console.log('✅ Middleware de body parsing configurado');
        this.middlewares.bodyParsing = true;
    }

    setupCorsMiddleware(app) {
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-timestamp, x-signature');

            // Manejar preflight requests
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }

            next();
        });

        console.log('✅ Middleware CORS configurado');
        this.middlewares.cors = true;
    }

    setupLoggingMiddleware(app) {
        app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
            next();
        });

        console.log('✅ Middleware de logging configurado');
        this.middlewares.logging = true;
    }

    // Método para obtener middlewares específicos
    getMiddleware(name) {
        return this.middlewares[name];
    }
}

export default new MiddlewareManager();
