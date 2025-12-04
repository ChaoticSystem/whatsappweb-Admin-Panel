// routes/auth.js - CON LOGS DE DEBUG
import express from 'express';
import { verifyCredentials } from '../middlewares/auth.js';
import middlewareManager from '../middlewares/index.js';

// Lockout configuration
const LOCKOUT_MAX_ATTEMPTS = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10);
const LOCKOUT_WINDOW_SECONDS = parseInt(process.env.LOCKOUT_WINDOW_SECONDS || String(15 * 60), 10); // 15 minutes

// In-memory fallback store when Redis not available
const inMemoryFailures = new Map();

function getIp(req) {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

async function getRedisClient() {
    try {
        const client = middlewareManager.getMiddleware('redisClient');
        return client || null;
    } catch (err) {
        return null;
    }
}

async function isBlocked(username, ip) {
    const redis = await getRedisClient();
    const userKey = `lockout:user:${username}`;
    const ipKey = `lockout:ip:${ip}`;

    if (redis) {
        try {
            const [u, i] = await Promise.all([redis.get(userKey), redis.get(ipKey)]);
            if ((u && parseInt(u, 10) >= LOCKOUT_MAX_ATTEMPTS) || (i && parseInt(i, 10) >= LOCKOUT_MAX_ATTEMPTS)) {
                return true;
            }
            return false;
        } catch (err) {
            return false;
        }
    }

    // fallback memory
    const u = inMemoryFailures.get(userKey) || 0;
    const i = inMemoryFailures.get(ipKey) || 0;
    return u >= LOCKOUT_MAX_ATTEMPTS || i >= LOCKOUT_MAX_ATTEMPTS;
}

async function incrementFailure(username, ip) {
    const redis = await getRedisClient();
    const userKey = `lockout:user:${username}`;
    const ipKey = `lockout:ip:${ip}`;

    if (redis) {
        try {
            await redis.multi()
                .incr(userKey)
                .expire(userKey, LOCKOUT_WINDOW_SECONDS)
                .incr(ipKey)
                .expire(ipKey, LOCKOUT_WINDOW_SECONDS)
                .exec();
        } catch (err) {
            // ignore redis errors
        }
        return;
    }

    // memory fallback with simple expiry timestamps
    const now = Date.now();
    const expireAt = now + LOCKOUT_WINDOW_SECONDS * 1000;

    // store as value "count:expireAt"
    const addOrInc = (key) => {
        const val = inMemoryFailures.get(key);
        if (!val) {
            inMemoryFailures.set(key, 1);
            setTimeout(() => inMemoryFailures.delete(key), LOCKOUT_WINDOW_SECONDS * 1000);
        } else {
            inMemoryFailures.set(key, val + 1);
        }
    };
    addOrInc(userKey);
    addOrInc(ipKey);
}

async function resetFailures(username, ip) {
    const redis = await getRedisClient();
    const userKey = `lockout:user:${username}`;
    const ipKey = `lockout:ip:${ip}`;

    if (redis) {
        try {
            await redis.del(userKey, ipKey);
        } catch (err) {
            // ignore
        }
        return;
    }

    inMemoryFailures.delete(userKey);
    inMemoryFailures.delete(ipKey);
}

const router = express.Router();

// Ruta de login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};

        console.log(`🔐 [AUTH] Intento de login recibido: ${username}`);

        if (!username || !password) {
            console.log('❌ [AUTH] Usuario o password vacíos');
            return res.status(400).json({
                success: false,
                error: 'Usuario y contraseña son requeridos'
            });
        }
        const ip = getIp(req);
        if (await isBlocked(username, ip)) {
            return res.status(429).json({ success: false, error: 'Demasiados intentos fallidos. Intente más tarde.' });
        }

        const user = await verifyCredentials(username, password);
        if (!user) {
            await incrementFailure(username, ip);
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
        }

        // Regenerate session to prevent session fixation and set minimal session data
        req.session.regenerate((err) => {
            if (err) {
                console.error('❌ [AUTH] Error regenerando sesión:', err);
                return res.status(500).json({ success: false, error: 'Error interno' });
            }

            req.session.authenticated = true;
            req.session.user = { username: user.username, role: user.role, name: user.name };
            req.session.loginTime = new Date().toISOString();

            req.session.save((err) => {
                    if (err) console.error('❌ [AUTH] Error guardando sesión:', err);

                    console.log(`✅ [AUTH] Login exitoso: ${user.username} (${user.role})`);

                    // If the client expects HTML (form submission), redirect to the admin panel.
                    const accept = (req.headers.accept || '').toLowerCase();
                    const contentType = (req.headers['content-type'] || '').toLowerCase();
                    const wantsHtml = accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');

                    if (wantsHtml) {
                        return res.redirect('/admin');
                    }

                    return res.json({
                        success: true,
                        message: 'Login exitoso',
                        user: {
                            username: user.username,
                            name: user.name,
                            role: user.role
                        }
                    });
                });
        });
        // successful login: reset failures
        await resetFailures(username, ip);

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
        // Clear session cookie on logout
        const cookieName = process.env.SESSION_COOKIE_NAME || 'sid';
        res.clearCookie(cookieName, { path: '/' });

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
    console.log(`🔐 [AUTH] Verificando sesión para: ${req.session?.user?.username || 'anonymous'}`);

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
