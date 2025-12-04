// middlewares/index.js
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import * as connectRedis from 'connect-redis';
import { SESSION_SECRET, requireAuth, requireAdmin } from './auth.js';

class MiddlewareManager {
    constructor() {
        this.middlewares = {};
    }

    async initialize(app, modules) {
        console.log('🛡️ Inicializando middlewares...');

        try {
            // 🔐 Middleware de sesiones (PRIMERO - importante)
            await this.setupSessionMiddleware(app);

            // 🔒 Middleware de seguridad (helmet, rate limiting)
            this.setupSecurityMiddleware(app);

            // 🔎 Sanitizar querys sensibles (antes del logging)
            this.setupQuerySanitizer(app);

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

    setupSecurityMiddleware(app) {
        // Helmet para encabezados de seguridad
        // Configuramos una política CSP que permite recursos del propio dominio y
        // admite el CDN de jsDelivr utilizado en `public/admin/index.html`.
        // Nota: habilitamos 'unsafe-inline' SOLO en desarrollo para evitar romper
        // scripts inline existentes. No usar 'unsafe-inline' en producción.
        const isProd = process.env.NODE_ENV === 'production';
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', !isProd ? "'unsafe-inline'" : false].filter(Boolean),
                        // Allow inline event handlers and inline scripts in development only
                        scriptSrcElem: ["'self'", 'https://cdn.jsdelivr.net', !isProd ? "'unsafe-inline'" : false].filter(Boolean),
                        // Allow inline event handlers (attributes) in development. In production, do NOT enable.
                        // Note: some browsers use 'script-src-attr' directive to control inline event handlers.
                        'script-src-attr': !isProd ? ["'unsafe-inline'"] : ["'none'"],
                        styleSrc: ["'self'", !isProd ? "'unsafe-inline'" : false].filter(Boolean),
                    imgSrc: ["'self'", 'data:'],
                    connectSrc: ["'self'", 'ws:', 'wss:'],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'self'"],
                    baseUri: ["'self'"]
                }
            }
        }));

        // Rate limiter básico para rutas de autenticación
        const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
        app.use(['/login', '/auth/login', '/api/login'], loginLimiter);

        // Nota: Para protección CSRF con sesiones basadas en cookies, considere
        // habilitar `csurf` y enviar el token al cliente. No lo habilitamos
        // automáticamente aquí porque requiere adaptación del frontend.

        this.middlewares.security = true;
        console.log('✅ Middleware de seguridad configurado (helmet + rate-limit)');
    }

    async setupSessionMiddleware(app) {
        // En producción la aplicación debe proveer SESSION_SECRET
        if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
            throw new Error('SESSION_SECRET no está definido en entorno de producción');
        }

        const sessionSecret = SESSION_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret');
        if (!sessionSecret) {
            throw new Error('SESSION_SECRET no está definido en entorno de producción');
        }

        if (!SESSION_SECRET) {
            console.warn('⚠️ SESSION_SECRET no definido; usando secreto de desarrollo (no usar en producción)');
        }

        const sessionOptions = {
            secret: sessionSecret,
            resave: false,
            saveUninitialized: false,
            name: process.env.SESSION_COOKIE_NAME || 'sid',
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'Lax',
                maxAge: 24 * 60 * 60 * 1000 // 24 horas
            }
        };

        // If REDIS_URL is provided, use it as session store (recommended for production)
        if (process.env.REDIS_URL) {
            try {
                // connect-redis may export differently depending on bundler/version.
                let RedisStoreConstructor = null;
                if (typeof connectRedis === 'function') {
                    RedisStoreConstructor = connectRedis(session);
                } else if (connectRedis && typeof connectRedis.default === 'function') {
                    RedisStoreConstructor = connectRedis.default(session);
                }

                if (!RedisStoreConstructor) {
                    console.warn('⚠️ connect-redis no se pudo inicializar; usando MemoryStore');
                } else {
                    // Use node-redis createClient() and connect explicitly
                    const redisClient = createClient({ url: process.env.REDIS_URL });
                    // connect() returns a promise
                    await redisClient.connect();

                    sessionOptions.store = new RedisStoreConstructor({ client: redisClient });
                    // Attach clients for other modules to use if needed
                    this.middlewares.redisClient = redisClient;
                    this.middlewares.sessionStore = sessionOptions.store;
                    console.log('✅ Redis session store configurado (node-redis)');
                }
            } catch (err) {
                console.error('❌ Error inicializando Redis session store:', err.message);
                // Fall back to memory store but warn
            }
        }

        app.use(session(sessionOptions));

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
        // Usar paquete cors y lista blanca para orígenes
        const whitelist = process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
            : ['http://localhost:3000'];

        const corsOptions = {
            origin: (origin, callback) => {
                // Allow requests with no origin (e.g. mobile apps, curl)
                if (!origin) return callback(null, true);
                // Some browsers/contexts send the literal string "null" as Origin
                if (origin === 'null') return callback(null, true);

                const originNormalized = origin.replace(/\/$/, '');

                // Exact match first
                if (whitelist.includes(originNormalized)) return callback(null, true);

                // Try to compare hostname/port equivalently (handle localhost vs 127.0.0.1 vs ::1)
                try {
                    const o = new URL(originNormalized);
                    for (const w of whitelist) {
                        try {
                            const wu = new URL(w);
                            const sameHost = wu.hostname === o.hostname
                                || (wu.hostname === 'localhost' && (o.hostname === '127.0.0.1' || o.hostname === '::1'))
                                || ((wu.hostname === '127.0.0.1' || wu.hostname === '::1') && o.hostname === 'localhost');
                            const samePort = (wu.port || '80') === (o.port || '80');
                            if (sameHost && samePort) return callback(null, true);
                        } catch (e) {
                            // ignore bad whitelist entry
                        }
                    }
                } catch (e) {
                    // ignore invalid origin
                }

                // Deny CORS without throwing an uncaught exception (browser will block)
                console.warn(`⚠️ CORS origin rechazado: ${origin}`);
                return callback(null, false);
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-timestamp', 'x-signature'],
            credentials: true
        };

        app.use(cors(corsOptions));

        console.log('✅ Middleware CORS configurado');
        this.middlewares.cors = true;
    }

    setupLoggingMiddleware(app) {
        app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            // Log path, not full URL, to avoid leaking query string parameters (credentials)
            console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
            next();
        });

        console.log('✅ Middleware de logging configurado');
        this.middlewares.logging = true;
    }

    setupQuerySanitizer(app) {
        // Remove username/password from query string to avoid accidental leakage
        app.use((req, res, next) => {
            try {
                const hasUser = req.query && (req.query.username || req.query.password);
                if (hasUser) {
                    console.warn('⚠️ Credenciales detectadas en query string; eliminando y redirigiendo a URL limpia');
                    // Remove sensitive query params
                    delete req.query.username;
                    delete req.query.password;

                    // build clean URL without query
                    return res.redirect(req.path);
                }
            } catch (err) {
                // ignore sanitizer errors
            }
            next();
        });

        this.middlewares.querySanitizer = true;
        console.log('✅ Query sanitizer configurado');
    }

    // Método para obtener middlewares específicos
    getMiddleware(name) {
        return this.middlewares[name];
    }
}

export default new MiddlewareManager();
