// routes/auth.js - CON LOGS DE DEBUG
import express from 'express';
import { verifyCredentials } from '../middlewares/auth.js';

const router = express.Router();

// Ruta de login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log(`🔐 [AUTH] Intento de login recibido:`, { username, password: '***' });
        console.log(`🔐 [AUTH] Sesión antes de login:`, req.session);

        if (!username || !password) {
            console.log('❌ [AUTH] Usuario o password vacíos');
            return res.status(400).json({
                success: false,
                error: 'Usuario y contraseña son requeridos'
            });
        }

        const user = await verifyCredentials(username, password);
        if (!user) {
            console.log('❌ [AUTH] Credenciales inválidas');
            return res.status(401).json({
                success: false,
                error: 'Credenciales inválidas'
            });
        }

        // Establecer sesión
        req.session.authenticated = true;
        req.session.user = user;
        req.session.loginTime = new Date().toISOString();

        console.log(`✅ [AUTH] Login exitoso: ${user.username} (${user.role})`);
        console.log(`✅ [AUTH] Sesión después de login:`, req.session);

        res.json({
            success: true,
            message: 'Login exitoso',
            user: {
                username: user.username,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('❌ [AUTH] Error en login:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

// Ruta de logout
router.post('/logout', (req, res) => {
    const username = req.session.user?.username || 'unknown';

    console.log(`🔐 [AUTH] Logout solicitado por: ${username}`);

    req.session.destroy((err) => {
        if (err) {
            console.error('❌ [AUTH] Error cerrando sesión:', err);
            return res.status(500).json({
                success: false,
                error: 'Error cerrando sesión'
            });
        }

        console.log(`✅ [AUTH] Logout exitoso: ${username}`);
        res.json({
            success: true,
            message: 'Sesión cerrada exitosamente'
        });
    });
});

// Ruta para verificar sesión
router.get('/verify', (req, res) => {
    console.log(`🔐 [AUTH] Verificando sesión:`, req.session);

    if (req.session && req.session.authenticated) {
        console.log(`✅ [AUTH] Sesión válida para: ${req.session.user.username}`);
        res.json({
            success: true,
            authenticated: true,
            user: {
                username: req.session.user.username,
                name: req.session.user.name,
                role: req.session.user.role,
                loginTime: req.session.loginTime
            }
        });
    } else {
        console.log('❌ [AUTH] No autenticado');
        res.json({
            success: false,
            authenticated: false,
            error: 'No autenticado'
        });
    }
});

export default router;
