// middlewares/auth.js - VERSIÓN CORREGIDA
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

// 🔥 PARA USAR __dirname EN ES MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar usuarios administrativos desde configuración segura.
// Preferir `process.env.ADMIN_USERS_JSON` (JSON: { "user": { "passwordHash": "...", "role": "", "name": "" } })
// O `process.env.ADMIN_USERS_FILE` que apunte a un archivo JSON con la misma estructura.
let ADMIN_USERS = {};

try {
    if (process.env.ADMIN_USERS_JSON) {
        ADMIN_USERS = JSON.parse(process.env.ADMIN_USERS_JSON);
    } else if (process.env.ADMIN_USERS_FILE && fs.existsSync(process.env.ADMIN_USERS_FILE)) {
        ADMIN_USERS = JSON.parse(fs.readFileSync(process.env.ADMIN_USERS_FILE, 'utf8'));
    } else if (process.env.NODE_ENV !== 'production') {
        // Fallback de desarrollo: generar hashes para usuarios de ejemplo.
        ADMIN_USERS = {
            admin: {
                passwordHash: bcrypt.hashSync('pass', 12),
                role: 'admin',
                name: 'Administrador Principal'
            },
            operador: {
                passwordHash: bcrypt.hashSync('Operador', 12),
                role: 'operator',
                name: 'Operador del Sistema'
            }
        };
        console.warn('⚠️ Usando usuarios administrativos de desarrollo. No usar en producción.');
    } else {
        throw new Error('ADMIN_USERS no configurado. Defina ADMIN_USERS_JSON o ADMIN_USERS_FILE');
    }
} catch (err) {
    console.error('❌ Error cargando ADMIN_USERS:', err.message);
    // En producción debemos fallar rápido; en dev continuar con objeto vacío.
    if (process.env.NODE_ENV === 'production') throw err;
}

// Log summary of loaded admin users (names only, no secrets)
try {
    const userKeys = Object.keys(ADMIN_USERS || {});
    if (userKeys.length === 0) {
        console.warn('⚠️ No se cargaron usuarios administrativos (ADMIN_USERS vacío)');
    } else {
        console.log(`🔐 Usuarios administrativos cargados: ${userKeys.length} -> ${userKeys.join(', ')}`);
    }
} catch (e) {
    // no-op
}

// SESSION_SECRET must be provided via env in production. Do not silently generate in prod.
const SESSION_SECRET = process.env.SESSION_SECRET;

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

    const hash = user.passwordHash || user.password; // backward compatible if file used different key
    if (!hash) {
        console.error('❌ No hay hash de password para el usuario:', username);
        return null;
    }

    try {
        const isValid = await bcrypt.compare(password, hash);
        if (!isValid) return null;

        return {
            username: username,
            name: user.name,
            role: user.role,
            loginTime: new Date().toISOString()
        };
    } catch (err) {
        console.error('❌ Error verificando password:', err.message);
        return null;
    }
}

// Middleware para servir panel admin con autenticación
function serveAdminPanel(req, res) {
    console.log('🔐 Intentando servir panel admin...');
    console.log('🔐 Sesión verificada para usuario:', req.session?.user?.username || 'anonymous');

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
