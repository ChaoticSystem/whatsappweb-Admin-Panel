// middlewares/auth.js - VERSIÓN CORREGIDA
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// 🔥 PARA USAR __dirname EN ES MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de usuarios (passwords en texto plano)
const ADMIN_USERS = {
    'admin': {
        password: 'StickerAdmin2024!', // Password en texto plano
        role: 'admin',
        name: 'Administrador Principal'
    },
    'operador': {
        password: 'Operador123!', // Password en texto plano
        role: 'operator',
        name: 'Operador del Sistema'
    }
};

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated && req.session.user) {
        console.log(`🔐 Usuario autenticado: ${req.session.user.username}`);
        return next();
    }

    console.log('❌ Acceso no autorizado a API');
    return res.status(401).json({
        success: false,
        error: 'No autorizado',
        redirect: '/admin/login.html'
    });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.authenticated && req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    return res.status(403).json({
        success: false,
        error: 'Se requieren privilegios de administrador'
    });
}

async function verifyCredentials(username, password) {
    console.log(`🔐 Verificando credenciales: ${username}`);

    const user = ADMIN_USERS[username];
    if (!user) {
        console.log(`❌ Usuario no encontrado: ${username}`);
        return null;
    }

    // Comparación simple de passwords (texto plano)
    const isValid = password === user.password;
    console.log(`🔐 Password válido: ${isValid}`);

    if (!isValid) return null;

    return {
        username: username,
        name: user.name,
        role: user.role,
        loginTime: new Date().toISOString()
    };
}

// Middleware para servir panel admin con autenticación
function serveAdminPanel(req, res) {
    console.log('🔐 Intentando servir panel admin...');
    console.log('🔐 Sesión:', req.session);

    if (req.session && req.session.authenticated) {
        console.log('✅ Usuario autenticado, sirviendo panel admin');
        return res.sendFile(path.join(__dirname, '../public/admin/index.html'));
    } else {
        console.log('❌ Usuario no autenticado, redirigiendo a login');
        return res.redirect('/admin/login.html');
    }
}

export {
    requireAuth,
    requireAdmin,
    verifyCredentials,
    SESSION_SECRET,
    serveAdminPanel
};
