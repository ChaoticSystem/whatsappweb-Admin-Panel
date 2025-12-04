// routes/admin.js - VERSIÓN MEJORADA Y OPTIMIZADA
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';
import modules from '../modules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 🔍 MIDDLEWARE MEJORADO PARA MÓDULOS
router.use((req, res, next) => {
    req.whatsappModule = modules.getModule('whatsapp');
    req.websocketModule = modules.getModule('websocket');
    console.log('📱 Módulos disponibles - WhatsApp:', !!req.whatsappModule, 'WebSocket:', !!req.websocketModule);
    next();
});


// =============================================
// 📊 RUTAS DEL API MEJORADAS
// =============================================

// 📥 Obtener compras pendientes - OPTIMIZADO
router.get('/api/compras-pendientes', async (req, res) => {
    try {
        console.log('📊 [API] Solicitando compras pendientes');

        const compras = await obtenerComprasPorEstado('pending');

        res.json({
            success: true,
            compras: compras,
            total: compras.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error obteniendo compras pendientes:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ✅ Obtener compras completadas - OPTIMIZADO
router.get('/api/compras-completadas', async (req, res) => {
    try {
        console.log('📊 [API] Solicitando compras completadas');

        const compras = await obtenerComprasPorEstado('completed');

        res.json({
            success: true,
            compras: compras,
            total: compras.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error obteniendo compras completadas:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ❌ Obtener compras canceladas - OPTIMIZADO
router.get('/api/compras-canceladas', async (req, res) => {
    try {
        console.log('📊 [API] Solicitando compras canceladas');

        const compras = await obtenerComprasPorEstado('canceled');

        res.json({
            success: true,
            compras: compras,
            total: compras.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error obteniendo compras canceladas:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 📈 Obtener estadísticas - OPTIMIZADO
router.get('/api/estadisticas', async (req, res) => {
    try {
        console.log('📊 [API] Solicitando estadísticas');

        const [pendientes, completadas, canceladas] = await Promise.all([
            obtenerComprasPorEstado('pending'),
            obtenerComprasPorEstado('completed'),
            obtenerComprasPorEstado('canceled')
        ]);

        const totalIngresos = completadas.reduce((sum, compra) => sum + (compra.valor_total || 0), 0);
        const totalVendidos = completadas.reduce((sum, compra) => sum + (compra.total_stickers || 0), 0);

        const estadisticas = {
            totalCompras: pendientes.length + completadas.length + canceladas.length,
            pendientes: pendientes.length,
            completadas: completadas.length,
            canceladas: canceladas.length,
            totalIngresos,
            totalVendidos,
            promedioCompra: completadas.length > 0 ? Math.round(totalIngresos / completadas.length) : 0,
            timestamp: new Date().toISOString()
        };

        console.log('📊 [API] Estadísticas calculadas:', estadisticas);
        res.json({ success: true, ...estadisticas });

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🔍 Obtener compra específica por ID
router.get('/api/compras/:id', async (req, res) => {
    try {
        const compraId = req.params.id;
        console.log(`🔍 [API] Buscando compra: ${compraId}`);

        const compra = await buscarCompraEnTodasLasCarpetas(compraId);

        if (!compra) {
            return res.status(404).json({
                success: false,
                error: 'Compra no encontrada',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            compra: compra,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error obteniendo compra:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});



// 🔧 FUNCIÓN AUXILIAR PARA FORMATEAR DINERO
function formatearDinero(amount) {
    return new Intl.NumberFormat('es-CO').format(amount || 0);
}
// ❌ Rechazar compra - CORREGIDO
router.post('/api/rechazar-compra/:id', async (req, res) => {
    try {
        const compraId = req.params.id;
        const { razon } = req.body;

        console.log(`❌ [API] Rechazando compra: ${compraId}`, { razon });

        if (!razon) {
            return res.status(400).json({
                success: false,
                error: 'La razón del rechazo es requerida',
                timestamp: new Date().toISOString()
            });
        }

        // Buscar compra primero
        const compra = await buscarCompraEnTodasLasCarpetas(compraId);
        if (!compra) {
            return res.status(404).json({
                success: false,
                error: 'Compra no encontrada',
                timestamp: new Date().toISOString()
            });
        }

        // Usar método del módulo WhatsApp - CORREGIDO
        let resultado;
        if (req.whatsappModule && req.whatsappModule.rechazarCompra) {
            // ✅ CORRECTO: pasar (compraId, razon)
            resultado = await req.whatsappModule.rechazarCompra(compraId, razon);

            if (!resultado.success) {
                return res.status(400).json({
                    success: false,
                    error: resultado.error,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // Fallback manual
            const compraActualizada = await moverCompraACarpeta(
                compraId,
                'compras_pendientes',
                'compras_canceladas',
                {
                    razon_cancelacion: razon,
                    fecha_cancelacion: new Date().toISOString()
                }
            );

            resultado = { success: true, compra: compraActualizada };
        }

        if (!resultado.compra) {
            return res.status(404).json({
                success: false,
                error: 'Compra no encontrada',
                timestamp: new Date().toISOString()
            });
        }

        // Emitir evento WebSocket
        await emitirEventoWebSocket('compra_cancelada', {
            compraId: resultado.compra.id,
            usuario: resultado.compra.usuario,
            razon: razon,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Compra rechazada exitosamente',
            compra: resultado.compra,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error rechazando compra:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🚫 Bloquear usuario - MEJORADO
router.post('/api/bloquear-usuario/:numero', async (req, res) => {
    try {
        const usuarioNumero = req.params.numero;
        const { razon } = req.body;

        console.log(`🚫 [API] Bloqueando usuario: ${usuarioNumero}`, { razon });

        if (!razon) {
            return res.status(400).json({
                success: false,
                error: 'La razón del bloqueo es requerida',
                timestamp: new Date().toISOString()
            });
        }

        // 1. Cancelar todas las compras pendientes del usuario
        const comprasAfectadas = await cancelarComprasUsuario(usuarioNumero, razon);

        // 2. Enviar mensaje de bloqueo
        let whatsappEnviado = false;
        if (req.whatsappModule && req.whatsappModule.bloquearUsuario) {
            const resultado = await req.whatsappModule.bloquearUsuario(usuarioNumero, razon);
            whatsappEnviado = resultado.success;
        }

        // 3. Emitir evento WebSocket
        await emitirEventoWebSocket('usuario_bloqueado', {
            userNumber: usuarioNumero,
            razon: razon,
            comprasAfectadas: comprasAfectadas.length,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: `Usuario ${usuarioNumero} bloqueado exitosamente`,
            comprasAfectadas: comprasAfectadas.length,
            whatsappEnviado: whatsappEnviado,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error bloqueando usuario:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 📧 Enviar mensaje personalizado - MEJORADO
router.post('/api/enviar-mensaje', async (req, res) => {
    try {
        const { numero, mensaje } = req.body;

        if (!numero || !mensaje) {
            return res.status(400).json({
                success: false,
                error: 'Número y mensaje son requeridos',
                timestamp: new Date().toISOString()
            });
        }

        let resultado = { success: false, error: 'WhatsApp no disponible' };

        if (req.whatsappModule && req.whatsappModule.enviarMensaje) {
            resultado = await req.whatsappModule.enviarMensaje(numero, mensaje);
        }

        res.json({
            ...resultado,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error enviando mensaje:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🔄 Estado de WhatsApp
router.get('/api/whatsapp-status', async (req, res) => {
    try {
        let status = { conectado: false, estado: 'desconectado' };

        if (req.whatsappModule && req.whatsappModule.verificarConexion) {
            status = req.whatsappModule.verificarConexion();
        }

        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error obteniendo estado WhatsApp:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================
// 🛠️ FUNCIONES AUXILIARES MEJORADAS
// =============================================

/**
 * 🔍 OBTENER COMPRAS POR ESTADO
 */
async function obtenerComprasPorEstado(estado) {
    const carpetas = {
        'pending': 'compras_pendientes',
        'completed': 'compras_completadas',
        'canceled': 'compras_canceladas'
    };

    const carpeta = carpetas[estado];
    if (!carpeta) return [];

    const carpetaPath = path.join(__dirname, `../${carpeta}`);
    if (!fs.existsSync(carpetaPath)) return [];

    const files = fs.readdirSync(carpetaPath).filter(f => f.endsWith('.json'));
    const compras = [];

    for (const file of files) {
        try {
            const filePath = path.join(carpetaPath, file);
            const compraData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // Verificar que el estado coincida
            if (compraData.estado === estado) {
                compras.push(compraData);
            }
        } catch (error) {
            console.error(`❌ Error leyendo archivo ${file}:`, error);
        }
    }

    // Ordenar por fecha más reciente primero
    return compras.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/**
 * 🔍 BUSCAR COMPRA EN TODAS LAS CARPETAS
 */
async function buscarCompraEnTodasLasCarpetas(compraId) {
    const carpetas = ['compras_pendientes', 'compras_completadas', 'compras_canceladas'];

    for (const carpeta of carpetas) {
        const carpetaPath = path.join(__dirname, `../${carpeta}`);
        if (!fs.existsSync(carpetaPath)) continue;

        const files = fs.readdirSync(carpetaPath);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const compraPath = path.join(carpetaPath, file);
                    const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));

                    if (compraData.id === compraId) {
                        return compraData;
                    }
                } catch (error) {
                    console.error(`❌ Error leyendo archivo ${file}:`, error);
                }
            }
        }
    }
    return null;
}

/**
 * 🔄 MOVER COMPRA ENTRE CARPETAS
 */
async function moverCompraACarpeta(compraId, carpetaOrigen, carpetaDestino, datosAdicionales = {}) {
    try {
        // Buscar archivo en carpeta origen
        const carpetaOrigenPath = path.join(__dirname, `../${carpetaOrigen}`);
        if (!fs.existsSync(carpetaOrigenPath)) return null;

        let archivoEncontrado = null;
        let compraData = null;

        const files = fs.readdirSync(carpetaOrigenPath);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const compraPath = path.join(carpetaOrigenPath, file);
                compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));

                if (compraData.id === compraId) {
                    archivoEncontrado = file;
                    break;
                }
            }
        }

        if (!archivoEncontrado || !compraData) return null;

        // Actualizar datos
        compraData.estado = carpetaDestino === 'compras_completadas' ? 'completed' : 'canceled';
        compraData.fecha_actualizacion = new Date().toISOString();
        Object.assign(compraData, datosAdicionales);

        // Crear carpeta destino si no existe
        const carpetaDestinoPath = path.join(__dirname, `../${carpetaDestino}`);
        if (!fs.existsSync(carpetaDestinoPath)) {
            fs.mkdirSync(carpetaDestinoPath, { recursive: true });
        }

        // Mover archivo
        const archivoOrigenPath = path.join(carpetaOrigenPath, archivoEncontrado);
        const archivoDestinoPath = path.join(carpetaDestinoPath, archivoEncontrado);

        fs.unlinkSync(archivoOrigenPath);
        fs.writeFileSync(archivoDestinoPath, JSON.stringify(compraData, null, 2));

        console.log(`✅ Compra ${compraId} movida de ${carpetaOrigen} a ${carpetaDestino}`);
        return compraData;

    } catch (error) {
        console.error('❌ Error moviendo compra:', error);
        return null;
    }
}

/**
 * ❌ CANCELAR COMPRAS DE USUARIO
 */
async function cancelarComprasUsuario(usuarioNumero, razon) {
    try {
        const comprasPendientes = await obtenerComprasPorEstado('pending');
        const comprasAfectadas = [];

        for (const compra of comprasPendientes) {
            if (compra.usuario === usuarioNumero) {
                const compraCancelada = await moverCompraACarpeta(
                    compra.id,
                    'compras_pendientes',
                    'compras_canceladas',
                    {
                        razon_cancelacion: `Usuario bloqueado: ${razon}`,
                        fecha_cancelacion: new Date().toISOString()
                    }
                );

                if (compraCancelada) {
                    comprasAfectadas.push(compraCancelada);
                }
            }
        }

        return comprasAfectadas;
    } catch (error) {
        console.error('❌ Error cancelando compras de usuario:', error);
        return [];
    }
}

/**
 * 🔄 ACTUALIZAR ESTADO DE COMPRA (fallback)
 */
async function actualizarEstadoCompra(compraId, nuevoEstado, datosAdicionales = {}) {
    try {
        console.log(`🔄 Actualizando estado de compra ${compraId} a: ${nuevoEstado}`);

        const comprasDir = path.join(__dirname, '../compras_pendientes');
        if (!fs.existsSync(comprasDir)) {
            console.log('❌ Carpeta compras_pendientes no existe');
            return null;
        }

        const files = fs.readdirSync(comprasDir);
        console.log(`📁 Archivos en carpeta: ${files.length}`);

        for (const file of files) {
            if (file.endsWith('.json') && file.includes(compraId)) {
                const compraPath = path.join(comprasDir, file);
                console.log(`📄 Procesando archivo: ${file}`);

                const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));
                console.log(`🔍 Estado anterior: ${compraData.estado}`);

                // Actualizar compra
                compraData.estado = nuevoEstado;
                compraData.fecha_actualizacion = new Date().toISOString();
                Object.assign(compraData, datosAdicionales);

                // Guardar cambios
                fs.writeFileSync(compraPath, JSON.stringify(compraData, null, 2));
                console.log(`✅ Compra ${compraId} actualizada a: ${nuevoEstado}`);
                console.log('📝 Datos actualizados:', {
                    estado: compraData.estado,
                    fecha_actualizacion: compraData.fecha_actualizacion,
                    numeros_stickers: compraData.numeros_stickers?.length || 0
                });

                return compraData;
            }
        }

        console.log(`❌ No se encontró archivo para compra: ${compraId}`);
        return null;
    } catch (error) {
        console.error('❌ Error actualizando estado de compra:', error);
        return null;
    }
}













// ✅ Aprobar compra - CON WHATSAPP
    // ✅ Aprobar compra - CON WHATSAPP
router.post('/api/aceptar-compra/:id', async (req, res) => {
    try {
        console.log('🎯 ========= INICIO RUTA ACEPTAR-COMPRA =========');
        console.log('📦 Parámetro ID:', req.params.id);

        const compraId = req.params.id;
        console.log(`✅ [API] Aprobando compra: ${compraId}`);

        // 1. Buscar la compra
        console.log(`🔍 [PASO 1] Buscando compra ${compraId} en pendientes...`);
        const compra = await buscarCompraPorId(compraId);
        if (!compra) {
            console.log(`❌ [ERROR] Compra ${compraId} no encontrada`);
            return res.status(404).json({
                success: false,
                error: 'Compra no encontrada'
            });
        }
        console.log(`✅ [PASO 1] Compra encontrada:`, {
            id: compra.id,
            usuario: compra.usuario,
            estado: compra.estado,
            total_stickers: compra.total_stickers
        });

        // 2. 📱 REGISTRAR EN SITIO WEB PHP
        console.log(`🌐 [PASO 2] Registrando compra en sitio web PHP...`);
        let registroWeb;
        let necesitaIntervencion = false;

        try {
            registroWeb = await registrarCompraEnSitioWeb(compra);
            console.log('✅ [REGISTRO WEB] Resultado completo:', JSON.stringify(registroWeb, null, 2));

            // Verificar si hay error de usuario no encontrado
            if (!registroWeb.success && registroWeb.error && registroWeb.error.includes('Usuario no encontrado')) {
                necesitaIntervencion = true;
                console.log('🚨 [INTERVENCIÓN] Usuario no encontrado en sistema PHP');
            }

        } catch (error) {
            console.error('❌ [ERROR] Error registrando compra en sitio web:', error);
            registroWeb = {
                success: false,
                error: error.message
            };

            if (error.message.includes('Usuario no encontrado')) {
                necesitaIntervencion = true;
            }
        }

        // 3. 🚨 MANEJAR INTERVENCIÓN REQUERIDA
        if (necesitaIntervencion) {
            console.log('🚨 [INTERVENCIÓN] Usuario no encontrado, requiriendo intervención manual');

            // Actualizar compra como "requiere intervención"
            const compraActualizada = await actualizarEstadoCompra(compraId, 'intervencion_requerida', {
                errorRegistro: registroWeb.error,
                fechaIntervencion: new Date().toISOString()
            });

            // Notificar al admin via WebSocket
            await emitirEventoWebSocket('intervencion_requerida', {
                compraId: compraActualizada.id,
                usuario: compraActualizada.usuario,
                error: 'Usuario no encontrado en sistema',
                timestamp: new Date(),
                mensaje: `Se requiere intervención manual para asignar stickers al usuario ${compraActualizada.usuario}`
            });

            // 📱 ENVIAR MENSAJE DE INTERVENCIÓN AL USUARIO
            let whatsappEnviado = false;
            if (req.whatsappModule && req.whatsappModule.enviarMensajeSimple) {
                try {
                    const mensajeError = `🚨 *ATENCIÓN REQUERIDA*\n\nHemos detectado un problema con tu registro.\n\n📞 Contacta a soporte: +57 3103134816`;
                    await req.whatsappModule.enviarMensajeSimple(compraActualizada.usuario, mensajeError);
                    whatsappEnviado = true;
                    console.log(`✅ Mensaje de intervención enviado a ${compraActualizada.usuario}`);
                } catch (error) {
                    console.error('❌ Error enviando mensaje de intervención:', error);
                }
            }

            return res.json({
                success: false,
                intervencionRequerida: true,
                message: 'Compra requiere intervención manual - Usuario no encontrado',
                compra: compraActualizada,
                whatsappEnviado: whatsappEnviado,
                error: registroWeb.error
            });
        }

        // 4. ✅ PROCESAMIENTO EXITOSO
        if (registroWeb.success) {
            console.log('🎉 [PASO 3] Compra registrada exitosamente en PHP');
            console.log('📊 Datos PHP recibidos:', {
                success: registroWeb.success,
                purchaseId: registroWeb.purchaseId,
                totalNumbers: registroWeb.totalNumbers,
                numbers: registroWeb.numbers,
                user: registroWeb.user
            });

            // 📦 MOVER COMPRA A COMPLETADAS USANDO TU FUNCIÓN
            console.log(`📁 [PASO 4] Moviendo compra a completadas...`);
            let compraCompletada;

            if (req.whatsappModule && req.whatsappModule.moverCompraACarpeta) {
                console.log('🔄 Usando moverCompraACarpeta del módulo WhatsApp...');

                const datosActualizacion = {
                    estado: 'completed',
                    fecha_aprobacion: new Date().toISOString(),
                    fecha_actualizacion: new Date().toISOString(),
                    numeros_stickers: registroWeb.numbers || [],
                    registro_web: registroWeb,
                    purchase_id_web: registroWeb.purchaseId || null,
                    usuario_info: registroWeb.user || null,
                    total_numbers_web: registroWeb.totalNumbers || 0,
                    formatted_numbers: registroWeb.formattedNumbers || []
                };

                console.log('📝 Datos de actualización:', datosActualizacion);

                compraCompletada = await req.whatsappModule.moverCompraACarpeta(
                    compraId,
                    'compras_completadas',
                    datosActualizacion
                );

                if (!compraCompletada) {
                    console.log('❌ Falló moverCompraACarpeta, intentando método alternativo...');
                    // Fallback: actualizar estado sin mover
                    compraCompletada = await actualizarEstadoCompra(compraId, 'completed', datosActualizacion);
                }
            } else {
                console.log('⚠️ Módulo WhatsApp no disponible, actualizando estado localmente...');
                compraCompletada = await actualizarEstadoCompra(compraId, 'completed', {
                    numeros_stickers: registroWeb.numbers || [],
                    registro_web: registroWeb,
                    fecha_aprobacion: new Date().toISOString()
                });
            }

            if (!compraCompletada) {
                throw new Error('No se pudo actualizar el estado de la compra');
            }

            console.log(`✅ [PASO 4] Estado actualizado: ${compraCompletada.estado}`);

            // 📱 ENVIAR MENSAJE WHATSAPP CON DATOS PHP
            console.log(`💬 [PASO 5] Enviando mensaje de aprobación por WhatsApp...`);
            let whatsappActualizado = false;
            let errorWhatsapp = null;

            if (req.whatsappModule && req.whatsappModule.aprobarCompra) {
                try {
                    console.log('🔄 Llamando a whatsappModule.aprobarCompra...');
                    const numerosStickers = registroWeb.numbers || [];
                    console.log(`🔢 Números a enviar:`, numerosStickers);

                    const resultadoWhatsapp = await req.whatsappModule.aprobarCompra(
                        compraId,
                        numerosStickers,
                        registroWeb // Pasar todos los datos PHP
                    );

                    whatsappActualizado = resultadoWhatsapp.success;
                    if (!resultadoWhatsapp.success) {
                        errorWhatsapp = resultadoWhatsapp.error;
                        console.error('❌ Error en whatsappModule.aprobarCompra:', errorWhatsapp);
                    } else {
                        console.log('✅ Mensaje de WhatsApp enviado exitosamente');
                    }
                } catch (error) {
                    console.error('❌ Error ejecutando whatsappModule.aprobarCompra:', error);
                    errorWhatsapp = error.message;
                }
            } else {
                console.warn('⚠️ Módulo WhatsApp no disponible o método aprobarCompra faltante');
                if (req.whatsappModule) {
                    console.log('📋 Métodos disponibles:', Object.keys(req.whatsappModule));
                }
            }

            // 🔔 NOTIFICAR VIA WEBSOCKET
            console.log(`📡 [PASO 6] Emitiendo evento WebSocket...`);
            await emitirEventoWebSocket('compra_aceptada', {
                compraId: compraId,
                usuario: compra.usuario,
                numerosAsignados: registroWeb.numbers?.length || 0,
                whatsappActualizado: whatsappActualizado,
                purchaseId: registroWeb.purchaseId,
                timestamp: new Date()
            });

            console.log('🎉 ========= PROCESO COMPLETADO EXITOSAMENTE =========');

            return res.json({
                success: true,
                message: 'Compra aprobada y números generados exitosamente',
                compra: compraCompletada,
                registroWeb: registroWeb,
                whatsappActualizado: whatsappActualizado,
                errorWhatsapp: errorWhatsapp,
                numerosGenerados: registroWeb.numbers || [],
                purchaseId: registroWeb.purchaseId
            });

        } else {
            // ❌ ERROR EN REGISTRO PHP
            console.error('❌ [ERROR] Error en registro PHP:', registroWeb.error);
            throw new Error(registroWeb.error || 'Error desconocido en registro PHP');
        }

    } catch (error) {
        console.error('❌ [ERROR CRÍTICO] Error aprobando compra:', error);
        console.error('🔍 Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});





async function buscarCompraPorId(compraId) {
    try {
        const comprasDir = path.join(__dirname, '../compras_pendientes');
        if (!fs.existsSync(comprasDir)) return null;

        const files = fs.readdirSync(comprasDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const compraPath = path.join(comprasDir, file);
                const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));
                if (compraData.id === compraId) {
                    return compraData;
                }
            }
        }
        return null;
    } catch (error) {
        console.error('❌ Error buscando compra:', error);
        return null;
    }
}


/**
 * 🌐 REGISTRAR COMPRA EN SITIO WEB PHP
 */
async function registrarCompraEnSitioWeb(compra) {
    try {
        let numeroNormalizado = compra.usuario.replace(/\D/g, "");
        if (numeroNormalizado.startsWith("57")) {
            numeroNormalizado = numeroNormalizado.substring(2);
        }

        const payload = {
            numero: numeroNormalizado,
            sorteoId: compra.sorteo_id || 1,
            cantidad: compra.total_stickers,
            valor: compra.valor_total,
            compraId: compra.id,
            nonce: crypto.randomBytes(16).toString('hex')
        };

        console.log('🌐 [REGISTRO WEB] Enviando payload:', payload);

        // ✅ URL CORRECTA - APUNTANDO AL PHP
        const response = await axios.post(
            'https://stickeruedaygana.com/api/registrarCompra.php',  // ← ESTA ES LA URL CORRECTA
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Auth-Token': 'DUDIDUDIDAMDAMDUDIDAMDUDIDUDIDAMDAMDUDIDAMVAMO',
                    'x-api-key': 'DUDIDUDIDAMDAMDUDIDAM',
                },
                timeout: 30000
            }
        );

        console.log('✅ [REGISTRO WEB] Respuesta:', response.data);

        if (response.data && response.data.success === true) {
            return {
                success: true,
                ...response.data,
                requiereIntervencion: false
            };
        } else {
            const serverError = response.data?.error || 'Error desconocido del servidor';
            const requiereIntervencion = serverError.includes('Usuario no encontrado');

            return {
                success: false,
                error: serverError,
                requiereIntervencion: requiereIntervencion
            };
        }

    } catch (error) {
        console.error('❌ [REGISTRO WEB] Error:', error?.message || error);

        const errorMessage = error.response?.data?.error || error.message;
        const requiereIntervencion = errorMessage.includes('Usuario no encontrado');

        return {
            success: false,
            error: `Error registrando compra: ${errorMessage}`,
            requiereIntervencion: requiereIntervencion
        };
    }
}

/**
 * 🔔 EMITIR EVENTO WEBSOCKET
 */
async function emitirEventoWebSocket(evento, datos) {
    try {
        const websocketModule = modules.getModule('websocket');
        if (websocketModule && websocketModule.io) {
            websocketModule.io.emit(evento, {
                ...datos,
                timestamp: new Date().toISOString()
            });
            console.log(`📡 [WEBSOCKET] Evento emitido: ${evento}`);
        }
    } catch (error) {
        console.error('❌ [WEBSOCKET] Error emitiendo evento:', error);
    }
}

/**
 * 🚨 MANEJAR INTERVENCIÓN REQUERIDA
 */
async function manejarIntervencionRequerida(compra, registroWeb) {
    // Emitir evento de intervención
    await emitirEventoWebSocket('intervencion_requerida', {
        compraId: compra.id,
        usuario: compra.usuario,
        error: registroWeb.error,
        mensaje: `Se requiere intervención manual para asignar stickers al usuario ${compra.usuario}`
    });

    // Enviar mensaje al usuario si WhatsApp está disponible
    const whatsappModule = modules.getModule('whatsapp');
    if (whatsappModule && whatsappModule.enviarMensaje) {
        const mensaje = `🚨 *ATENCIÓN REQUERIDA*\n\nHemos detectado un problema con tu registro.\n\n📞 Contacta a soporte: +57 3103134816`;
        await whatsappModule.enviarMensaje(compra.usuario, mensaje);
    }
}





/**
 * ✅ ENVIAR MENSAJE DE COMPRA APROBADA
 */
async function enviarMensajeCompraAprobada(compra, registroWeb) {
    const whatsappModule = modules.getModule('whatsapp');
    if (!whatsappModule || !whatsappModule.enviarMensaje) return;

    const numerosStr = registroWeb.numbers ? registroWeb.numbers.join(', ') : 'pendientes de asignación';

    const mensaje = `🎉 *¡COMPRA APROBADA!* 🎉\n\n` +
                   `Tu compra ha sido procesada exitosamente.\n\n` +
                   `📋 *Detalles:*\n` +
                   `• 🎫 Stickers: ${compra.total_stickers}\n` +
                   `• 🔢 Números asignados: ${numerosStr}\n` +
                   `• 💰 Valor: $${compra.valor_total?.toLocaleString() || 0}\n\n` +
                   `¡Gracias por tu compra! 🏍️`;

    await whatsappModule.enviarMensaje(compra.usuario, mensaje);
}

export default router;
