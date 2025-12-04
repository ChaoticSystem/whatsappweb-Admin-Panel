// routes/index.js - VERSIÓN CORREGIDA Y COMPLETA (ES6)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, serveAdminPanel } from '../middlewares/auth.js';
import authRouter from './auth.js';
import adminRoutes from './admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Routes {
    constructor() {
        this.router = express.Router();
    }

    async initialize(app, modules, middlewares) {
        console.log('🛣️  Inicializando sistema de rutas...');

        try {
            // 🔐 SERVIR ARCHIVOS ESTÁTICOS DEL ADMIN
            this.setupStaticRoutes(app);

            // 🔐 RUTAS DE AUTENTICACIÓN
            this.setupAuthRoutes(app);

            // 👨‍💼 RUTAS DEL PANEL ADMIN (PROTEGIDAS)
            this.setupAdminRoutes(app, modules);

            // 🌐 RUTAS PÚBLICAS
            this.setupPublicRoutes(app, modules);

            // ❌ MANEJO DE ERRORES
            this.setupErrorHandlers(app);

            console.log('✅ Todas las rutas cargadas correctamente');
            return {
                auth: 'loaded',
                admin: 'loaded',
                public: 'loaded',
                static: 'loaded'
            };

        } catch (error) {
            console.error('❌ Error cargando rutas:', error);
            throw error;
        }
    }

   setupStaticRoutes(app) {
    // Servir archivos estáticos del admin (login, CSS, JS, etc.)
    app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

    // Servir comprobantes de pago - AGREGAR ESTA RUTA
    app.use('/comprobantes', express.static(path.join(__dirname, '../comprobantes')));
    app.use('/payments', express.static(path.join(__dirname, '../comprobantes'))); // ← ALIAS para compatibilidad

    app.use('/socket.io', express.static(path.join(__dirname, '../node_modules/socket.io/client-dist')));

    console.log('✅ Rutas estáticas configuradas');
}

    setupAuthRoutes(app) {
        app.use('/admin/auth', authRouter);
        console.log('✅ Rutas de autenticación configuradas');
    }

    setupAdminRoutes(app, modules) {
        // 🔐 PROTEGER LAS RUTAS API DEL ADMIN CON AUTENTICACIÓN
        app.use('/admin', requireAuth, adminRoutes);
        console.log('✅ Rutas de admin API protegidas con autenticación');

        // 🔐 SERVIR EL PANEL ADMIN CON AUTENTICACIÓN
        app.get('/admin', serveAdminPanel);
     
        console.log('✅ Panel admin protegido con autenticación');
    }

    setupPublicRoutes(app, modules) {
        // Ruta de health check
        app.get('/health', (req, res) => {
            const status = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'Sticker Rueda y Gana',
                version: '1.0.0',
                modules: {
                    websocket: modules.websocket ? 'active' : 'inactive',
                    whatsapp: modules.whatsapp ? modules.whatsapp.verificarConexion() : 'inactive'
                }
            };
            res.json(status);
        });

        // Ruta principal - redirigir al login del admin
        app.get('/', (req, res) => {
            res.redirect('/admin/login.html');
        });

        // Ruta de información del sistema
        app.get('/info', (req, res) => {
            res.json({
                name: 'Sticker Rueda y Gana API',
                description: 'Sistema de gestión de stickers y rifas',
                version: '1.0.0',
                endpoints: {
                    admin: '/admin',
                    health: '/health',
                    auth: '/admin/auth'
                }
            });
        });

        console.log('✅ Rutas públicas configuradas');
    }

    setupErrorHandlers(app) {
        // Manejo de errores 404 para API
        app.use('/api/*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint de API no encontrado',
                path: req.originalUrl
            });
        });

        // Manejo de errores 404 para rutas generales
        app.use('*', (req, res) => {
            if (req.accepts('html')) {
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Página No Encontrada - Sticker Rueda y Gana</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            h1 { color: #e74c3c; }
                        </style>
                    </head>
                    <body>
                        <h1>❌ Página No Encontrada</h1>
                        <p>La página que buscas no existe.</p>
                        <a href="/admin/login.html">← Volver al Login</a>
                    </body>
                    </html>
                `);
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Ruta no encontrada',
                    path: req.originalUrl
                });
            }
        });

        // Manejo de errores generales
        app.use((error, req, res, next) => {
            console.error('❌ Error no manejado:', error);

            if (req.path.startsWith('/api') || req.path.startsWith('/admin/api')) {
                res.status(500).json({
                    success: false,
                    error: 'Error interno del servidor',
                    message: process.env.NODE_ENV === 'development' ? error.message : 'Contacte al administrador'
                });
            } else {
                res.status(500).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Error del Servidor - Sticker Rueda y Gana</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            h1 { color: #e74c3c; }
                        </style>
                    </head>
                    <body>
                        <h1>❌ Error del Servidor</h1>
                        <p>Ha ocurrido un error interno. Por favor intente más tarde.</p>
                        <a href="/admin/login.html">← Volver al Login</a>
                    </body>
                    </html>
                `);
            }
        });

        console.log('✅ Manejo de errores configurado');
    }
}

export default new Routes();
