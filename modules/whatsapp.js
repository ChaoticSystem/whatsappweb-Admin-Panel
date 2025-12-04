import {
    default as makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    delay,
    downloadMediaMessage
} from 'baileys';
import qrcodeTerminal from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppModule {
    constructor() {
        // Configuración inicial - variables y estados
        this.sock = null;
        this.initialized = false;
        this.isConnecting = false;
        this.qrGenerated = false;
        this.websocket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // Configuración API
        this.REMOTE_API_BASE = "https://stickeruedaygana.com";
        this.REMOTE_API_CHECK_PATH = "/api/getUserData.php";
        this.TIEMPO_MAXIMO_COMPRA = 60 * 60 * 1000;
        // Estados de usuario
        this.userStates = new Map();

        // Formatos permitidos
        this.ALLOWED_MEDIA_TYPES = ['imageMessage'];
        this.ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        this.MAX_FILE_SIZE = 10 * 1024 * 1024;

        //carpeta compras pendientes
        this.comprasDir = path.join(__dirname, '../compras_pendientes');

        // Control de intentos
        this.failedAttempts = new Map();
        this.MAX_ATTEMPTS = 3;
        this.ATTEMPT_TIMEOUT = 10 * 60 * 1000;

        // Cache de configuración
        this.configSorteos = null;
        this.lastConfigUpdate = null;
        this.CONFIG_CACHE_TIMEOUT = 5 * 60 * 1000;


        // Estadísticas
        this.stats = {
            mensajesEnviados: 0,
            comprasProcesadas: 0,
            comprobantesRecibidos: 0,
            usuariosBloqueados: 0,
            comprasRechazadas: 0,
            mensajesRecibidos: 0
        };

        this.crearEstructuraCarpetas();
        this.verificarTiempoCompras();
    }


    async guardarCompra(sender, datosCompra, pushName, sorteoInfo = null) {
    try {
        const compraId = `compra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const compraData = {
            id: compraId,
            usuario: sender,
            nombre_cliente: pushName || 'Cliente',
            sorteo_id: sorteoInfo?.id || 1,
            sorteo_nombre: sorteoInfo?.nombre || 'Sticker Rueda y Gana',
            total_stickers: datosCompra.cantidadStickers,
            valor_total: datosCompra.valorTotal,
            fecha: new Date().toISOString(),
            estado: 'pending',
            datos_compra: datosCompra,
            comprobante: null // Se llenará cuando envíen imagen
        };

        const filePath = path.join(this.comprasDir, `${compraId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(compraData, null, 2));

        console.log(`💾 Compra guardada: ${compraId} para ${sender}`);

        // Emitir evento WebSocket
        if (this.websocket) {
            this.websocket.emit('nueva_compra', compraData);
            console.log(`📡 Evento WebSocket emitido: nueva_compra`);
        }

        return compraId;

    } catch (error) {
        console.error('❌ Error guardando compra:', error);
        return null;
    }
}



async verificarTiempoCompras() {
    // Ejecutar cada minuto para limpiar compras expiradas
    setInterval(async () => {
        const ahora = Date.now();

        for (const [sender, userState] of this.userStates.entries()) {
            if (userState.esperandoComprobante && userState.timestampComprobante) {

                // ✅ VERIFICAR CRÍTICO: ¿La compra sigue existiendo en archivos?
                const compraActiva = await this.obtenerCompraActiva(sender);

                if (!compraActiva) {
                    // ❌ La compra ya fue procesada (aprobada/rechazada) - LIMPIAR MEMORIA
                    console.log(`🧹 Limpiando estado en memoria (compra ya procesada): ${sender}`);
                    this.limpiarEstadoUsuario(sender);
                    continue;
                }

                // ✅ Solo verificar tiempo si la compra sigue activa
                const tiempoTranscurrido = ahora - userState.timestampComprobante;

                if (tiempoTranscurrido > this.TIEMPO_MAXIMO_COMPRA) {
                    console.log(`⏰ Compra expirada para ${sender}`);
                    await this.finalizarCompraPorTiempo(sender);
                }
            }
        }
    }, 60000);
}


limpiarEstadoUsuario(sender) {
    if (this.userStates.has(sender)) {
        // ✅ DESTRUIR completamente el estado de compra
        const userState = this.userStates.get(sender);

        // Mantener solo información básica, eliminar todo lo relacionado con compras
        userState.esperandoComprobante = false;
        userState.datosCompraPendiente = null;
        userState.timestampComprobante = null;
        userState.intentosFallidos = 0;
        userState.compraActiva = false;
        userState.comprobanteGuardado = null;

        console.log(`🧹 Estado de compra destruido para: ${sender}`);
    }
}


/*
async finalizarCompraPorTiempo(sender) {
    try {
        console.log(`⏰ Finalizando compra por tiempo para: ${sender}`);

        const userState = this.userStates.get(sender);
        if (userState && userState.esperandoComprobante) {

            // Enviar mensaje de expiración
            await this.enviarMensajeSimple(sender,
                `⏰ *COMPRA EXPIRADA*\n\n` +
                `Tu compra ha expirado por superar el tiempo límite de 1 hora.\n\n` +
                `📦 *Detalles de la compra expirada:*\n` +
                `• Stickers: ${userState.datosCompraPendiente.cantidadStickers}\n` +
                `• Valor: $${this.formatearValor(userState.datosCompraPendiente.valorTotal)}\n\n` +
                `🔄 *Para realizar una nueva compra:*\n` +
                `Envía un nuevo mensaje de compra con el formato correcto.\n\n` +
                `📞 *¿Necesitas ayuda?*\n` +
                `Contacta a soporte: +57 3103134816`
            );

            // Limpiar estado
            this.finalizarCompraActual(sender, 'tiempo_expirado');

            console.log(`✅ Compra expirada notificada a ${sender}`);
        }
    } catch (error) {
        console.error('❌ Error finalizando compra por tiempo:', error);
    }
}
*/

async finalizarCompraPorTiempo(sender) {
    try {
        console.log(`⏰ Finalizando compra por tiempo para: ${sender}`);

        // ✅ VERIFICAR SI LA COMPRA AÚN EXISTE
        const compraActiva = await this.obtenerCompraActiva(sender);
        if (!compraActiva) {
            console.log(`ℹ️ Compra ya no existe para ${sender}, limpiando estado en memoria`);
            this.limpiarEstadoUsuario(sender);
            return;
        }

        const userState = this.userStates.get(sender);
        if (userState && userState.esperandoComprobante) {

            // Enviar mensaje de expiración
            await this.enviarMensajeSimple(sender,
                `⏰ *COMPRA EXPIRADA*\n\n` +
                `Tu compra ha expirado por superar el tiempo límite de 1 hora.\n\n` +
                `📦 *Detalles de la compra expirada:*\n` +
                `• Stickers: ${userState.datosCompraPendiente.cantidadStickers}\n` +
                `• Valor: $${this.formatearValor(userState.datosCompraPendiente.valorTotal)}\n\n` +
                `🔄 *Para realizar una nueva compra:*\n` +
                `Envía un nuevo mensaje de compra con el formato correcto.\n\n` +
                `📞 *¿Necesitas ayuda?*\n` +
                `Contacta a soporte: +57 3103134816`
            );

            // Mover compra a canceladas
            await this.moverCompraACarpeta(
                compraActiva.id,
                'compras_canceladas',
                {
                    razon_cancelacion: 'Tiempo de compra expirado (1 hora)',
                    fecha_cancelacion: new Date().toISOString(),
                    estado: 'expirada'
                }
            );

            // Limpiar estado
            this.limpiarEstadoUsuario(sender);

            console.log(`✅ Compra expirada notificada y procesada para ${sender}`);
        }
    } catch (error) {
        console.error('❌ Error finalizando compra por tiempo:', error);
    }
}



    // =============================================
    // 🚀 CONFIGURACIÓN INICIAL Y CONEXIÓN
    // =============================================

    crearEstructuraCarpetas() {
        const carpetas = [
            '../compras_pendientes',
            '../compras_completadas',
            '../compras_canceladas',
            '../comprobantes',
            '../sessions'
        ];

        carpetas.forEach(carpeta => {
            const rutaCompleta = path.join(__dirname, carpeta);
            if (!fs.existsSync(rutaCompleta)) {
                fs.mkdirSync(rutaCompleta, { recursive: true });
                console.log(`✅ Carpeta creada: ${carpeta}`);
            }
        });
    }

    async initialize(io) {
        console.log('🚀 Inicializando módulo WhatsApp...');
        this.websocket = io;

        try {
            await this.startConnection();
            console.log('✅ Módulo inicializado correctamente');
            return this;
        } catch (error) {
            console.error('❌ Error inicializando:', error);
            await this.scheduleReconnect();
            return this;
        }
    }

    async startConnection() {
        if (this.initialized || this.isConnecting) return;

        this.isConnecting = true;
        console.log('🚀 Iniciando conexión WhatsApp...');

        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState('./sessions');

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 60000
            });

            this.setupEventHandlers(saveCreds);
            console.log('✅ Socket configurado correctamente');

        } catch (error) {
            this.isConnecting = false;
            console.error('❌ Error en startConnection:', error);
            throw error;
        }
    }

    setupEventHandlers(saveCreds) {
        // Manejo de conexión
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log(`🔄 Estado conexión: ${connection}`);

            if (qr) {
                this.handleQRGeneration(qr);
            }

            if (connection === 'open') {
                await this.handleSuccessfulConnection();
            }

            if (connection === 'close') {
                await this.handleConnectionClose(lastDisconnect);
            }
        });

        // Manejo de credenciales
        this.sock.ev.on('creds.update', saveCreds);

        // Manejo de mensajes
        this.sock.ev.on('messages.upsert', async (data) => {
            console.log('\n📨 === EVENTO MESSAGES.UPSERT ===');
            console.log('Tipo:', data.type);
            console.log('Cantidad mensajes:', data.messages?.length);
            await this.handleMessages(data);
        });
    }

    // =============================================
    // 🔄 MANEJO DE CONEXIÓN Y RECONEXIÓN
    // =============================================

    handleQRGeneration(qr) {
        this.qrGenerated = true;
        console.log('\n🎯 ESCANEA ESTE CÓDIGO QR:');
        qrcodeTerminal.generate(qr, { small: true });

        if (this.websocket) {
            this.websocket.emit('whatsapp_qr', { qr: qr });
            this.websocket.emit('whatsapp_status', { status: 'qr_required' });
        }
    }

    async handleSuccessfulConnection() {
        this.initialized = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log('✅ WhatsApp conectado correctamente');

        if (this.websocket) {
            this.websocket.emit('whatsapp_status', { status: 'ready' });
        }
    }

    async handleConnectionClose(lastDisconnect) {
        this.initialized = false;
        this.isConnecting = false;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`🔌 Conexión cerrada. Código: ${statusCode}`);

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
            console.log('🔄 Reconectando en 5 segundos...');
            setTimeout(async () => {
                try {
                    await this.cleanup();
                    await this.startConnection();
                } catch (error) {
                    await this.scheduleReconnect();
                }
            }, 5000);
        } else {
            console.log('❌ Sesión cerrada. Se requiere nuevo QR.');
            await this.cleanupSession();
            setTimeout(async () => {
                await this.forceNewQR();
            }, 3000);
        }
    }

    async cleanup() {
        this.initialized = false;
        this.isConnecting = false;
        this.qrGenerated = false;

        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                if (this.sock.ws) this.sock.ws.close();
                this.sock.end();
                this.sock = null;
            } catch (error) {
                console.error('❌ Error limpiando socket:', error);
            }
        }
    }

    async cleanupSession() {
        try {
            const sessionsDir = './sessions';
            if (fs.existsSync(sessionsDir)) {
                fs.rmSync(sessionsDir, { recursive: true, force: true });
                console.log('✅ Sesiones limpiadas');
            }
        } catch (error) {
            console.error('❌ Error limpiando sesiones:', error);
        }
    }

    async scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Límite de intentos de reconexión alcanzado');
            return;
        }

        this.reconnectAttempts++;
        const delayTime = Math.min(5000 * this.reconnectAttempts, 30000);

        console.log(`🔄 Reconectando en ${delayTime/1000}s... (Intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(async () => {
            if (!this.initialized && !this.isConnecting) {
                try {
                    await this.cleanup();
                    await this.startConnection();
                } catch (error) {
                    console.error('❌ Error en reconexión:', error);
                }
            }
        }, delayTime);
    }

    async forceNewQR() {
        try {
            await this.cleanup();
            await delay(2000);
            await this.startConnection();
        } catch (error) {
            console.error('❌ Error forzando nuevo QR:', error);
            await this.scheduleReconnect();
        }
    }

    // =============================================
    // 🔍 DETECCIÓN Y VALIDACIÓN DE USUARIOS
    // =============================================

    verificarNumeroRemitente(msg) {
        console.log('\n🔍 === INICIO DETECCIÓN NÚMERO ===');

        try {
            const estrategias = [
                // ESTRATEGIA 1: participantPn (LID)
                () => {
                    if (msg.key?.participantPn && msg.key.participantPn.includes('@s.whatsapp.net')) {
                        const numero = msg.key.participantPn.split('@')[0];
                        return { numero, fuente: 'participantPn', prioridad: 1 };
                    }
                    return null;
                },

                // ESTRATEGIA 2: phoneNumber
                () => {
                    if (msg.key?.phoneNumber) {
                        const numero = msg.key.phoneNumber.replace(/\D/g, '');
                        if (numero.length >= 8) {
                            return { numero, fuente: 'phoneNumber', prioridad: 2 };
                        }
                    }
                    return null;
                },

                // ESTRATEGIA 3: RemoteJidAlt
                () => {
                    if (msg.key?.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
                        const numero = msg.key.remoteJidAlt.split('@')[0];
                        return { numero, fuente: 'remoteJidAlt', prioridad: 3 };
                    }
                    return null;
                },

                // ESTRATEGIA 4: RemoteJid tradicional
                () => {
                    if (msg.key?.remoteJid && msg.key.remoteJid.includes('@s.whatsapp.net')) {
                        const numero = msg.key.remoteJid.split('@')[0];
                        return { numero, fuente: 'remoteJid', prioridad: 4 };
                    }
                    return null;
                },

                // ESTRATEGIA 5: Participant (grupos)
                () => {
                    if (msg.key?.participant && msg.key.participant.includes('@s.whatsapp.net')) {
                        const numero = msg.key.participant.split('@')[0];
                        return { numero, fuente: 'participant', prioridad: 5 };
                    }
                    return null;
                }
            ];

            // Ejecutar estrategias
            let resultados = [];

            for (const estrategia of estrategias) {
                try {
                    const resultado = estrategia();
                    if (resultado) {
                        console.log(`🎯 ${resultado.fuente}: ${resultado.numero}`);
                        resultados.push(resultado);
                    }
                } catch (error) {
                    console.log(`⚠️ Error en estrategia:`, error);
                }
            }

            // Ordenar por prioridad
            resultados.sort((a, b) => a.prioridad - b.prioridad);

            if (resultados.length > 0) {
                const mejor = resultados[0];
                const numeroNormalizado = this.normalizarNumero(mejor.numero);

                if (this.validarNumero(numeroNormalizado)) {
                    console.log(`✅ NÚMERO ENCONTRADO: ${numeroNormalizado} (fuente: ${mejor.fuente})`);
                    return {
                        numeroReal: numeroNormalizado,
                        esNumeroValido: true,
                        fuente: mejor.fuente,
                        pushName: msg.pushName || 'Sin nombre'
                    };
                }
            }

            console.log('❌ NINGUNA ESTRATEGIA FUNCIONÓ');
            return {
                numeroReal: 'unknown',
                esNumeroValido: false,
                fuente: 'none',
                pushName: msg.pushName || 'Sin nombre'
            };

        } catch (error) {
            console.log('💥 ERROR en verificarNumeroRemitente:', error);
            return {
                numeroReal: 'unknown',
                esNumeroValido: false,
                fuente: 'error',
                pushName: msg.pushName || 'Sin nombre'
            };
        }
    }

    normalizarNumero(numero) {
        if (!numero || numero === 'unknown') return 'unknown';

        let limpio = numero.replace(/\D/g, '');

        if (limpio.length === 0) return 'unknown';

        // Para números colombianos: quitar 57 si está al inicio
        if (limpio.startsWith('57') && limpio.length > 10) {
            const sin57 = limpio.substring(2);
            return sin57.length === 10 ? sin57 : limpio;
        }

        return limpio;
    }

    validarNumero(numero) {
        return numero && numero !== 'unknown' && numero.length >= 8;
    }

    // =============================================
    // 🌐 VALIDACIÓN DE USUARIO EN API REMOTA
    // =============================================

    async validarUsuarioRemoto(numero, textoMensaje = '', sorteoId = null) {
        try {
            console.log(`🌐 Validando usuario en API: ${numero}`);

            // Detectar sorteo desde el texto si no se proporciona
            let sorteoDetectado = null;
            if (!sorteoId) {
                sorteoDetectado = this.detectarSorteoDesdeTexto(textoMensaje);
                sorteoId = sorteoDetectado.id;
            }

            // Primero detectar si es mensaje de compra
            const esCompra = this.esMensajeDeCompra(textoMensaje);
            let datosCompra = null;

            if (esCompra) {
                datosCompra = this.extraerDatosCompra(textoMensaje);
                console.log('🛒 Mensaje identificado como COMPRA');
            }

            const payload = {
                numero: numero,
                sorteo_id: sorteoId,
                texto: textoMensaje,
                es_compra: esCompra,
                datos_compra: datosCompra
            };

            console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));

            const response = await axios.post(
                `${this.REMOTE_API_BASE}${this.REMOTE_API_CHECK_PATH}`,
                payload,
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Auth-Token': 'DUDIDUDIDAMDAMDUDIDAMDUDIDUDIDAMDAMDUDIDAMVAMO',
                        'x-api-key': 'DUDIDUDIDAM',
                    }
                }
            );

            console.log(`📥 Respuesta API:`, response.data);

            if (response.data && response.data.success) {
                console.log(`✅ Usuario válido: ${numero}`);

                // Si es compra, procesar flujo de compra
                if (esCompra && response.data.compra_permitida !== false) {
                    console.log('🛒 Iniciando flujo de compra...');
                    return {
                        valido: true,
                        usuario: response.data.user,
                        datos: response.data,
                        esCompra: true,
                        datosCompra: datosCompra,
                        compraPermitida: true,
                        sorteoId: sorteoId,
                        sorteoInfo: sorteoDetectado
                    };
                }

                return {
                    valido: true,
                    usuario: response.data.user,
                    datos: response.data,
                    esCompra: esCompra,
                    compraPermitida: response.data.compra_permitida || false,
                    sorteoId: sorteoId,
                    sorteoInfo: sorteoDetectado
                };

            } else {
                console.log(`❌ Usuario no válido en API: ${numero}`);
                return {
                    valido: false,
                    tipoError: 'usuario_no_registrado',
                    error: response.data?.error || 'Usuario no registrado en el sistema',
                    esCompra: esCompra
                };
            }

        } catch (error) {
            console.error('❌ Error validando usuario en API:');
            console.error('   📍 Status:', error.response?.status);
            console.error('   📍 Status Text:', error.response?.statusText);
            console.error('   📍 Data:', error.response?.data);
            console.error('   📍 Mensaje:', error.message);

            // ✅ SOLUCIÓN: Si es error 403, tratar como usuario REGISTRADO temporalmente
            if (error.response?.status === 403) {
                console.log('⚠️ API retornó 403 - Tratando como usuario REGISTRADO temporalmente');

                const esCompra = this.esMensajeDeCompra(textoMensaje);
                let datosCompra = null;
                const sorteoDetectado = this.detectarSorteoDesdeTexto(textoMensaje);

                if (esCompra) {
                    datosCompra = this.extraerDatosCompra(textoMensaje);
                }

                return {
                    valido: true, // ✅ CAMBIO CRÍTICO: true en lugar de false
                    usuario: { numero: numero },
                    datos: { temporal: true, razon: 'api_403' },
                    esCompra: esCompra,
                    datosCompra: datosCompra,
                    compraPermitida: esCompra, // Permitir compra si es mensaje de compra
                    sorteoId: sorteoDetectado.id,
                    sorteoInfo: sorteoDetectado
                };
            }

            // Para otros errores, tratar como no registrado
            console.log('⚠️ Error de API, enviando mensaje de registro...');
            return {
                valido: false,
                tipoError: 'usuario_no_registrado',
                error: 'Usuario no registrado en el sistema',
                esCompra: this.esMensajeDeCompra(textoMensaje)
            };
        }
    }

    // =============================================
    // 🛒 SISTEMA DE DETECCIÓN DE COMPRAS
    // =============================================

    esMensajeDeCompra(texto) {
    console.log('🔍 Analizando si es mensaje de compra...');
    console.log('📝 Texto recibido:', texto);

    // Si el texto está vacío o es muy corto, no es compra
    if (!texto || texto.length < 10) {
        console.log('❌ Texto muy corto, no es compra');
        return false;
    }

    // Patrones principales de compra - MÁS ESTRICTOS
    const patronesCompra = [
        /^¡Quiero comprar estos stickers!/i,
        /^Sticker Rueda y Gana.*\d+\s*stickers.*\$\d+/i,
        /Total stickers:\s*\d+/i,
        /Valor total:\s*\$\d+/i
    ];

    // Verificar patrones directos
    for (const patron of patronesCompra) {
        if (patron.test(texto)) {
            console.log('✅ Patrón de compra detectado:', patron);
            return true;
        }
    }

    // Análisis por líneas para mensajes estructurados
    const lineas = texto.split('\n').filter(linea => linea.trim());
    console.log('📄 Líneas del mensaje:', lineas);

    // Verificar estructura exacta
    const tieneInicioExacto = lineas.some(linea =>
        linea.trim() === '¡Quiero comprar estos stickers!'
    );

    const tieneStickersLinea = lineas.some(linea =>
        /Sticker Rueda y Gana.*\d+\s*stickers.*\$\d+/.test(linea)
    );

    const tieneTotalExacto = lineas.some(linea =>
        /^Total stickers:\s*\d+$/.test(linea.trim())
    );

    const tieneValorExacto = lineas.some(linea =>
        /^Valor total:\s*\$\d+$/.test(linea.trim())
    );

    console.log('📊 Resultados análisis ESTRICTO:');
    console.log('   - Inicio exacto:', tieneInicioExacto);
    console.log('   - Línea stickers:', tieneStickersLinea);
    console.log('   - Total exacto:', tieneTotalExacto);
    console.log('   - Valor exacto:', tieneValorExacto);

    const esCompraValida = tieneInicioExacto && tieneStickersLinea && tieneTotalExacto && tieneValorExacto;
    console.log('🎯 ¿Es mensaje de compra VÁLIDO?', esCompraValida);

    return esCompraValida;
}

    // =============================================
    // 🔍 EXTRACCIÓN DE DATOS DE COMPRA
    // =============================================

    extraerDatosCompra(texto) {
        console.log('🔍 Extrayendo datos de compra...');

        try {
            const datos = {
                cantidadStickers: 0,
                valorTotal: 0,
                items: [],
                textoOriginal: texto
            };

            // Buscar cantidad de stickers
            const cantidadMatch = texto.match(/Total stickers:\s*(\d+)/i) ||
                                 texto.match(/(\d+)\s*stickers/i) ||
                                 texto.match(/Sticker Rueda y Gana.*?(\d+)\s*stickers/i);

            if (cantidadMatch) {
                datos.cantidadStickers = parseInt(cantidadMatch[1]);
                console.log('📦 Cantidad stickers:', datos.cantidadStickers);
            }

            // Buscar valor total - MEJORADO para detectar correctamente
            const valorMatch = texto.match(/Valor total:\s*\$\s*([\d.,]+)/i) ||
                              texto.match(/\$\s*([\d.,]+)/g);

            if (valorMatch) {
                if (Array.isArray(valorMatch)) {
                    // Buscar el valor más grande (que suele ser el total)
                    let maxValor = 0;
                    for (const valor of valorMatch) {
                        // Limpiar el valor (quitar puntos, comas, símbolos)
                        const valorLimpio = valor.replace(/[^\d]/g, '');
                        const valorNum = parseInt(valorLimpio);
                        if (valorNum > maxValor) {
                            maxValor = valorNum;
                        }
                    }
                    datos.valorTotal = maxValor;
                } else {
                    const valorLimpio = valorMatch[1].replace(/[^\d]/g, '');
                    datos.valorTotal = parseInt(valorLimpio);
                }
                console.log('💰 Valor total detectado:', datos.valorTotal);
            }

            // ✅ CORRECCIÓN: Si el valor total es muy bajo pero hay cantidad, calcularlo
            if ((datos.valorTotal === 0 || datos.valorTotal < 1000) && datos.cantidadStickers > 0) {
                datos.valorTotal = datos.cantidadStickers * 1000; // 1000 por sticker
                console.log('💰 Valor calculado automáticamente:', datos.valorTotal);
            }

            // Extraer items individuales
            const lineas = texto.split('\n');
            lineas.forEach(linea => {
                if ((linea.includes('sticker') || linea.includes('Sticker')) && linea.includes('$')) {
                    const itemMatch = linea.match(/(\d+)\s*stickers?\s*-\s*\$\s*([\d.,]+)/i);
                    if (itemMatch) {
                        const precioLimpio = itemMatch[2].replace(/[^\d]/g, '');
                        datos.items.push({
                            descripcion: linea.trim(),
                            cantidad: parseInt(itemMatch[1]),
                            precio: parseInt(precioLimpio)
                        });
                    }
                }
            });

            console.log('✅ Datos extraídos:', {
                cantidadStickers: datos.cantidadStickers,
                valorTotal: datos.valorTotal,
                valorFormateado: this.formatearValor(datos.valorTotal),
                items: datos.items.length
            });

            return datos;

        } catch (error) {
            console.error('❌ Error extrayendo datos de compra:', error);
            return {
                cantidadStickers: 0,
                valorTotal: 0,
                items: [],
                textoOriginal: texto,
                error: error.message
            };
        }
    }

    formatearValor(valor) {
        try {
            // Asegurarnos de que es un número
            const numero = parseInt(valor) || 0;

            // Formatear con separadores de miles
            return numero.toLocaleString('es-CO', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        } catch (error) {
            console.error('❌ Error formateando valor:', error);
            return valor.toString();
        }
    }


      // =============================================
    // 🛒 FLUJO DE PROCESAMIENTO DE COMPRAS
    // =============================================

    async procesarFlujoCompra(sender, datosCompra, pushName, sorteoInfo = null) {
        try {
            console.log('🛒 Iniciando flujo de compra para:', sender);


            const compraId = await this.guardarCompra(sender, datosCompra, pushName, sorteoInfo);

        if (!compraId) {
            throw new Error('No se pudo guardar la compra');
        }


            // ✅ PASO 1: ENVIAR CONFIRMACIÓN CON IMAGEN (1er mensaje)
            await this.enviarConfirmacionCompraConImagen(sender, datosCompra, pushName, sorteoInfo);

            // ✅ PASO 2: ENVIAR SOLO LA LLAVE (2do mensaje) - SOLO EL TEXTO
            await delay(1000);
            await this.enviarSoloLlaveTexto(sender);

            // ✅ PASO 3: Esperar comprobante
            await this.registrarEsperaComprobante(sender, datosCompra);

            console.log('✅ Flujo de compra iniciado correctamente (2 mensajes enviados)');

        } catch (error) {
            console.error('❌ Error en flujo de compra:', error);
            await this.enviarMensajeSimple(sender,
                '❌ Ocurrió un error procesando tu compra. Por favor contacta a soporte: +57 3103134816'
            );
        }
    }

    async enviarConfirmacionCompraConImagen(sender, datosCompra, pushName, sorteoInfo = null) {
        try {
            const imagePath = path.join(__dirname, '../img/llave.png');

            // Texto bien formateado para la confirmación
            let caption = `${sorteoInfo?.icon || '✅'} *COMPRA CONFIRMADA* 🛒\n\n` +
                         `Hola *${pushName}*, hemos recibido tu solicitud de compra:\n\n` +
                         `📦 *Total stickers:* ${datosCompra.cantidadStickers}\n` +
                         `💰 *Valor a pagar:* $${datosCompra.valorTotal.toLocaleString()}\n\n`;

            // Agregar información del sorteo si está disponible
            if (sorteoInfo && sorteoInfo.nombre) {
                caption += `🎯 *Actividad:* ${sorteoInfo.nombre}\n\n`;
            }

            // Agregar información del premio si está disponible
            if (sorteoInfo && sorteoInfo.premio) {
                caption += `🏆 *Premio:* ${sorteoInfo.premio.nombre}\n` +
                          `💫 *Valor:* ${sorteoInfo.premio.costo_mercado}\n\n`;
            }

            caption += `💳 *Instrucciones:*\n` +
                      `1. Realiza la transferencia por el valor exacto\n` +
                      `2. Toma captura del comprobante\n` +
                      `3. Envíalo aquí por este mismo chat\n\n` +
                      `⏰ *Tiempo máximo:* 1 hora\n` +
                      `✅ Asegúrate que el comprobante sea legible`;

            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                await this.sock.sendMessage(this.formatJidForSending(sender), {
                    image: imageBuffer,
                    caption: caption
                });
                console.log(`📸 Confirmación con imagen enviada a ${sender}`);
            } else {
                // Fallback si no existe la imagen
                await this.enviarMensajeSimple(sender, caption);
                console.log(`📝 Confirmación sin imagen enviada a ${sender}`);
            }

        } catch (error) {
            console.error('❌ Error enviando confirmación con imagen:', error);
            // Fallback a mensaje simple
            await this.enviarConfirmacionCompra(sender, datosCompra, pushName, sorteoInfo);
        }
    }

    async enviarSoloLlaveTexto(sender) {
        // ✅ SOLO EL TEXTO DE LA LLAVE - SIN FORMATO EXTRA
        const mensaje = `@DAVISTIKRUEDGANA`;

        await this.enviarMensajeSimple(sender, mensaje);
        console.log(`🔑 Llave BRE-B enviada (solo texto) a ${sender}`);
    }

    async enviarConfirmacionCompra(sender, datosCompra, pushName, sorteoInfo = null) {
        let mensaje = `✅ *COMPRA CONFIRMADA* 🛒\n\n` +
                     `Hola *${pushName}*, hemos recibido tu solicitud de compra:\n\n` +
                     `📦 *Total stickers:* ${datosCompra.cantidadStickers}\n` +
                     `💰 *Valor a pagar:* $${datosCompra.valorTotal.toLocaleString()}\n\n`;

        if (sorteoInfo && sorteoInfo.nombre) {
            mensaje += `🎯 *Actividad:* ${sorteoInfo.nombre}\n\n`;
        }

        mensaje += `💳 *Instrucciones:*\n` +
                  `1. Realiza la transferencia por el valor exacto\n` +
                  `2. Toma captura del comprobante\n` +
                  `3. Envíalo aquí por este mismo chat\n\n` +
                  `⏰ *Tiempo máximo:* 1 hora\n` +
                  `✅ Asegúrate que el comprobante sea legible`;

        await this.enviarMensajeSimple(sender, mensaje);
    }

 async registrarEsperaComprobante(sender, datosCompra) {
    if (!this.userStates.has(sender)) {
        this.userStates.set(sender, {});
    }

    const userState = this.userStates.get(sender);
    userState.esperandoComprobante = true;
    userState.datosCompraPendiente = datosCompra;
    userState.timestampComprobante = Date.now();
    userState.intentosComprobante = 0;
    userState.intentosFallidos = 0; // ✅ NUEVO: Inicializar contador de fallos
    userState.compraActiva = true;

    console.log(`⏳ Registrada espera de comprobante para: ${sender}`);
    console.log(`   - Stickers: ${datosCompra.cantidadStickers}`);
    console.log(`   - Valor: $${this.formatearValor(datosCompra.valorTotal)}`);
    console.log(`   - Tiempo máximo: 1 hora`);
    console.log(`   - Intentos máximos: 3`);
}


    // =============================================
    // 💬 SISTEMA DE MENSAJERÍA Y RESPUESTAS
    // =============================================

    async solicitarRegistro(sender) {
        const mensaje = `📝 *REGISTRO REQUERIDO*\n\n` +
                       `Tu número no está registrado en nuestro sistema.\n\n` +
                       `🌐 *Para registrarte:*\n` +
                       `Visita nuestra página web:\n` +
                       `https://stickeruedaygana.com\n\n` +
                       `📞 *Soporte:* +57 3103134816\n\n` +
                       `¡Una vez registrado podrás realizar tus compras! 🏍️`;

        await this.enviarMensajeSimple(sender, mensaje);
    }

    async sendMenuPrincipal(sender, pushName = 'Cliente') {
        const mensaje = `🤖 *STICKER RUEDA Y GANA* 🏍️\n\n` +
                       `¡Hola *${pushName}*! Bienvenido al sistema automatizado.\n\n` +
                       `🛒 *Para realizar tu compra:*\n` +
                       `1. Visita nuestra página web\n` +
                       `2. Selecciona los stickers deseados\n` +
                       `3. Copia el mensaje de compra automático\n` +
                       `4. Pégalo aquí en WhatsApp\n\n` +
                       `🌐 *Página web:*\n` +
                       `https://stickeruedaygana.com\n\n` +
                       `💡 *Ejemplo de mensaje de compra:*\n` +
                       `"¡Quiero comprar estos stickers!\n` +
                       `📝 Sticker Rueda y Gana: 10 stickers - $10,000\n` +
                       `📦 Total stickers: 10\n` +
                       `💰 Valor total: $10,000"\n\n` +
                       `¡Estamos aquí para ayudarte! 🎉`;

        await this.enviarMensajeSimple(sender, mensaje);
    }

    async sendUSAResponse(sender) {
        const mensaje = `🇺🇸 *WELCOME TO STICKER RUEDA Y GANA* 🏍️\n\n` +
                       `We see you're from the United States!\n\n` +
                       `🌐 *To participate:*\n` +
                       `Please visit our website to register:\n` +
                       `https://stickeruedaygana.com\n\n` +
                       `📞 *Support:* +57 3103134816\n\n` +
                       `We'll be happy to assist you! 🎉`;

        await this.enviarMensajeSimple(sender, mensaje);
    }

    esNumeroUSA(sender) {
        const numeroLimpio = sender.replace(/\D/g, '');
        return numeroLimpio.startsWith('1') && numeroLimpio.length === 11;
    }

    async enviarMensajeSimple(sender, texto) {
        try {
            if (!this.sock || !this.initialized) {
                console.log(`❌ Socket no conectado, no se puede enviar mensaje a ${sender}`);
                return;
            }

            const jid = this.formatJidForSending(sender);
            await this.sock.sendMessage(jid, { text: texto });
            this.stats.mensajesEnviados++;
            console.log(`✅ Mensaje enviado a ${sender}`);

        } catch (error) {
            console.error(`❌ Error enviando mensaje a ${sender}:`, error.message);
        }
    }

    formatJidForSending(numero) {
        if (!numero || numero === 'unknown') {
            return 'unknown@s.whatsapp.net';
        }

        if (numero.length === 10 && !numero.startsWith('57')) {
            return '57' + numero + '@s.whatsapp.net';
        }
        else if (numero.length === 10 && numero.startsWith('1')) {
            return '1' + numero + '@s.whatsapp.net';
        }
        else {
            return numero + '@s.whatsapp.net';
        }
    }

    // =============================================
    // 📨 PROCESAMIENTO DE MENSAJES PRINCIPAL
    // =============================================

    async handleMessages(data) {
        try {
            console.log('\n📨 === INICIO PROCESAMIENTO BATCH ===');
            console.log('Tipo batch:', data.type);
            console.log('Cantidad total mensajes:', data.messages?.length);

            if (!data.messages || data.messages.length === 0) {
                console.log('🚫 No hay mensajes para procesar');
                return;
            }

            const mensajesExternos = data.messages.filter(msg => {
                const esExterno = !msg.key.fromMe &&
                                !this.isProtocolMessage(msg) &&
                                msg.key.remoteJid !== 'status@broadcast' &&
                                !this.isForwardedMessage(msg);
                return esExterno;
            });

            console.log(`📊 Resumen filtro: ${mensajesExternos.length} externos de ${data.messages.length} total`);

            if (mensajesExternos.length === 0) {
                console.log('🚫 No hay mensajes externos para procesar');
                return;
            }

            // Procesar cada mensaje externo
            for (const msg of mensajesExternos) {
                try {
                    console.log(`\n🔄 INICIANDO PROCESAMIENTO MENSAJE INDIVIDUAL`);
                    console.log(`👤 De: ${msg.pushName || 'Sin nombre'}`);

                    // Verificar si el usuario está en proceso de compra
                    const verificacion = this.verificarNumeroRemitente(msg);
                    if (verificacion.esNumeroValido) {
                        const sender = verificacion.numeroReal;

                        if (this.estaEnProcesoCompra(sender)) {
                            await this.procesarMensajeEnCompra(sender, msg);
                            continue; // Saltar procesamiento normal
                        }
                    }

                    // Procesamiento normal si no está en compra
                    await this.processSingleMessage(msg);

                } catch (error) {
                    console.error('❌ Error procesando mensaje individual:', error);
                }
            }

            console.log('✅ === FIN PROCESAMIENTO BATCH ===\n');

        } catch (error) {
            console.error('💥 ERROR CRÍTICO en handleMessages:', error);
        }
    }

    async processSingleMessage(msg) {
    console.log('🔍 === INICIO PROCESAMIENTO MENSAJE INDIVIDUAL ===');

    try {
        // PASO 1: DETECTAR NÚMERO / VALIDAR REMITENTE
        const verificacion = this.verificarNumeroRemitente(msg);

        if (!verificacion.esNumeroValido) {
            console.log(`❌ Número inválido ignorado: ${verificacion.numeroReal}`);
            return;
        }

        const sender = verificacion.numeroReal;

        // ✅ Sincronizar estado ANTES de verificar compra activa
        await this.sincronizarEstadoConArchivos(sender);

        const messageType = Object.keys(msg.message || {})[0];
        const texto = this.extraerTextoMensaje(msg);

        console.log(`👤 Mensaje de ${sender} (${msg.pushName || 'Sin nombre'}): ${messageType}`);
        console.log(`📝 Contenido: ${texto}`);

        this.stats.mensajesRecibidos++;

        // ✅ Primero: verificar si ya está en compra activa
        if (this.tieneCompraActiva(sender)) {
            console.log('🔄 Usuario tiene compra activa, verificando tipo de mensaje...');

            if (this.esMensajeDeCompra(texto)) {
                console.log('🚫 BLOQUEADO: Nueva compra detectada durante compra activa');
                await this.notificarCompraActiva(sender);
                return;
            }

            console.log('ℹ️ Mensaje normal durante compra activa, procesando...');
        }

        // PASO 2: VALIDAR USUARIO VIA API
        const validacionUsuario = await this.validarUsuarioRemoto(sender, texto);

        if (!validacionUsuario.valido) {
            console.log(`❌ Usuario no registrado: ${sender}`);

            if (this.esNumeroUSA(sender)) {
                await this.sendUSAResponse(sender);
            } else {
                await this.solicitarRegistro(sender);
            }
            return;
        }

        console.log(`✅ Usuario registrado: ${sender}`);

        // PASO 3: VERIFICAR SI ES COMPRA
        const esCompra = this.esMensajeDeCompra(texto);
        console.log(`🎯 ¿Es mensaje de compra? ${esCompra}`);

        if (esCompra) {
            console.log('🛒 Mensaje identificado como COMPRA, procesando...');

            // ✅ Evitar múltiples compras simultáneas
            if (this.tieneCompraActiva(sender)) {
                await this.notificarCompraActiva(sender);
                return;
            }

            const datosCompra = this.extraerDatosCompra(texto);

            // Validación de datos coherentes
            if (datosCompra.cantidadStickers <= 0 || datosCompra.valorTotal <= 0) {
                await this.enviarMensajeSimple(sender,
                    `❌ *COMPRA NO VÁLIDA*\n\n` +
                    `Los datos no son válidos:\n\n` +
                    `• Stickers: ${datosCompra.cantidadStickers}\n` +
                    `• Valor: $${this.formatearValor(datosCompra.valorTotal)}\n\n` +
                    `💡 *Formato correcto:*\n` +
                    `Sticker Rueda y Gana: X stickers - $Y\n` +
                    `Total stickers: X\n` +
                    `Valor total: $Y`
                );
                return;
            }

            // 🚀 Procesar flujo de compra completo
            await this.procesarFlujoCompra(sender, datosCompra, msg.pushName, validacionUsuario.sorteoInfo);

            console.log('✅ Flujo de compra completado');
            return;
        }

        // 💬 Si no es compra → flujo normal de información
        console.log('💬 Mensaje normal, enviando info...');
        await this.enviarMensajeSimple(sender,
            `🤖 *STICKER RUEDA Y GANA* 🏍️\n\n` +
            `¡Hola *${msg.pushName || 'Cliente'}*! Para realizar tu compra:\n\n` +
            `🌐 *Visita nuestra página web:*\n` +
            `https://stickeruedaygana.com\n\n` +
            `🛒 *Instrucciones:*\n` +
            `1. Selecciona los stickers\n` +
            `2. Copia el mensaje de compra\n` +
            `3. Envíalo por aquí\n\n` +
            `¡Listo! Te ayudaremos con el pago 💰`
        );

        console.log('✅ === FIN PROCESAMIENTO MENSAJE ===');

    } catch (error) {
        console.error('💥 ERROR en processSingleMessage:', error);
    }
}



async limpiarEstadosObsoletos() {
    try {
        console.log('🧹 Iniciando limpieza de estados obsoletos...');
        let limpiados = 0;

        for (const [sender, userState] of this.userStates.entries()) {
            if (userState.esperandoComprobante) {
                const compraActiva = this.obtenerCompraActivaSync(sender);
                if (!compraActiva) {
                    console.log(`🧹 Limpiando estado obsoleto para: ${sender}`);
                    this.finalizarCompraActual(sender, 'limpieza_automatica');
                    limpiados++;
                }
            }
        }

        console.log(`✅ Limpieza completada: ${limpiados} estados obsoletos eliminados`);
        return limpiados;

    } catch (error) {
        console.error('❌ Error en limpieza de estados obsoletos:', error);
        return 0;
    }
}



/*COMPRA ACEPTADA ENVIANDOSE A WHATSAPP*/




/*FIN */





async notificarCompraActiva(sender) {
    try {
        const userState = this.userStates.get(sender);
        if (!userState || !userState.esperandoComprobante) return;

        const tiempoRestante = this.TIEMPO_MAXIMO_COMPRA - (Date.now() - userState.timestampComprobante);
        const minutosRestantes = Math.ceil(tiempoRestante / (60 * 1000));
        const intentosRestantes = 3 - (userState.intentosFallidos || 0);

        const compraActiva = await this.obtenerCompraActiva(sender);

        let mensaje = `🔄 *COMPRA EN PROCESO*\n\n` +
                     `*Ya tienes una compra pendiente de pago.*\n\n`;

        if (compraActiva) {
            mensaje += `📋 *Detalles de tu compra:*\n` +
                      `• 🎫 Stickers: ${compraActiva.total_stickers}\n` +
                      `• 💰 Valor: $${this.formatearValor(compraActiva.valor_total)}\n` +
                      `• ⏰ Tiempo restante: ${minutosRestantes} minutos\n` +
                      `• 📸 Intentos restantes: ${intentosRestantes}/3\n\n`;
        }

        mensaje += `💳 *PARA COMPLETAR TU COMPRA:*\n` +
                  `Envía la captura de pantalla del comprobante de pago por este mismo chat.\n\n` +
                  `⚠️ *IMPORTANTE:*\n` +
                  `• Tienes *${minutosRestantes} minutos* para enviar el comprobante\n` +
                  `• Tienes *${intentosRestantes} intentos* restantes\n` +
                  `• Después de 3 intentos fallidos, la compra se CANCELARÁ\n` +
                  `• Si no envías el comprobante en 1 hora, la compra será RECHAZADA\n\n` +
                  `📸 *Recomendaciones:*\n` +
                  `• Asegúrate que el comprobante sea legible\n` +
                  `• Verifica que el monto sea correcto\n` +
                  `• La imagen debe estar nítida y completa\n\n` +
                  `🔄 *¿Problemas?* Contacta a soporte: +57 3103134816`;

        await this.enviarMensajeSimple(sender, mensaje);
        console.log(`✅ Mensaje de "compra activa" enviado a ${sender}`);

    } catch (error) {
        console.error(`❌ Error notificando compra activa a ${sender}:`, error);
    }
}

async obtenerCompraActiva(sender) {
    try {
        const comprasDir = path.join(__dirname, '../compras_pendientes');
        if (!fs.existsSync(comprasDir)) return null;

        const files = fs.readdirSync(comprasDir);

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(comprasDir, file);
                const compraData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                if (compraData.usuario === sender && compraData.estado === 'pending') {
                    return compraData;
                }
            }
        }
        return null;
    } catch (error) {
        console.error('❌ Error obteniendo compra activa:', error);
        return null;
    }
}


    // =============================================
    // 🛠️ UTILIDADES DE PROCESAMIENTO DE MENSAJES
    // =============================================

    extraerTextoMensaje(msg) {
        if (msg.message?.conversation) {
            return msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            return msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage?.caption) {
            return msg.message.imageMessage.caption;
        }
        return '[Medio]';
    }

    isProtocolMessage(msg) {
        const protocolTypes = ['protocolMessage', 'senderKeyDistributionMessage'];
        const messageType = Object.keys(msg.message || {})[0];
        return protocolTypes.includes(messageType);
    }

    isForwardedMessage(msg) {
        return msg.message?.extendedTextMessage?.contextInfo?.isForwarded === true ||
               msg.message?.imageMessage?.contextInfo?.isForwarded === true;
    }

    // =============================================
    // 🎯 SISTEMA DE GESTIÓN DE SORTEOS
    // =============================================

    cargarConfiguracionSorteos() {
        try {
            const configPath = path.join(__dirname, '../config/config.json');

            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);

                this.configSorteos = config.sorteos || [];
                this.lastConfigUpdate = Date.now();

                console.log('✅ Configuración de sorteos cargada:', this.configSorteos.length, 'sorteos');
                return this.configSorteos;
            } else {
                console.log('⚠️ Archivo de configuración no encontrado:', configPath);
                return [];
            }
        } catch (error) {
            console.error('❌ Error cargando configuración de sorteos:', error);
            return [];
        }
    }

    obtenerConfiguracionSorteos() {
        // Cache de 5 minutos
        if (!this.configSorteos ||
            !this.lastConfigUpdate ||
            (Date.now() - this.lastConfigUpdate) > this.CONFIG_CACHE_TIMEOUT) {
            return this.cargarConfiguracionSorteos();
        }
        return this.configSorteos;
    }

    detectarSorteoDesdeTexto(texto) {
        try {
            const sorteos = this.obtenerConfiguracionSorteos();

            if (!sorteos || sorteos.length === 0) {
                console.log('⚠️ No hay configuración de sorteos disponible');
                return {
                    id: 1,
                    nombre: 'Sticker Rueda y Gana',
                    keyword: 'rueda y gana',
                    icon: '🏍️'
                }; // Default
            }

            const textoLimpio = texto.toLowerCase();

            for (const sorteo of sorteos) {
                // Verificar si el sorteo está activo
                if (sorteo.status !== 'activo') {
                    continue;
                }

                // Buscar por keyword (tu campo específico)
                if (sorteo.keyword && textoLimpio.includes(sorteo.keyword.toLowerCase())) {
                    console.log(`🎯 Sorteo detectado por keyword: ${sorteo.nombre} (ID: ${sorteo.id})`);
                    return sorteo;
                }

                // Buscar por nombre también por si acaso
                if (sorteo.nombre && textoLimpio.includes(sorteo.nombre.toLowerCase())) {
                    console.log(`🎯 Sorteo detectado por nombre: ${sorteo.nombre} (ID: ${sorteo.id})`);
                    return sorteo;
                }
            }

            // Si no se detecta, usar el primero activo por defecto
            const sorteoActivo = sorteos.find(s => s.status === 'activo');
            if (sorteoActivo) {
                console.log('ℹ️ No se detectó sorteo específico, usando primer sorteo activo:', sorteoActivo.nombre);
                return sorteoActivo;
            }

            // Si no hay activos, usar el primero
            console.log('ℹ️ No hay sorteos activos, usando primer sorteo disponible');
            return sorteos[0] || {
                id: 1,
                nombre: 'Sticker Rueda y Gana',
                keyword: 'rueda y gana',
                icon: '🏍️'
            };

        } catch (error) {
            console.error('❌ Error detectando sorteo:', error);
            return {
                id: 1,
                nombre: 'Sticker Rueda y Gana',
                keyword: 'rueda y gana',
                icon: '🏍️'
            };
        }
    }
       // =============================================
    // 🔄 GESTIÓN DE ESTADOS DE USUARIO DURANTE COMPRAS
    // =============================================

   estaEnProcesoCompra(sender) {
    const userState = this.userStates.get(sender);
    if (!userState || !userState.esperandoComprobante) return false;

    // Verificar si no ha expirado
    const tiempoTranscurrido = Date.now() - userState.timestampComprobante;
    return tiempoTranscurrido <= this.TIEMPO_MAXIMO_COMPRA;
}


tieneCompraActiva(sender) {
    console.log(`🔍 Verificando compra activa para: ${sender}`);

    // ✅ PRIMERO VERIFICAR ARCHIVOS
    const compraActivaEnArchivos = this.obtenerCompraActivaSync(sender);

    if (!compraActivaEnArchivos) {
        console.log(`❌ No hay compra activa en archivos para: ${sender}`);

        // Limpiar estado en memoria si no hay compra en archivos
        if (this.userStates.has(sender)) {
            const userState = this.userStates.get(sender);
            if (userState.esperandoComprobante) {
                console.log(`🔄 Limpiando estado en memoria obsoleto para: ${sender}`);
                this.finalizarCompraActual(sender, 'sin_compra_archivos');
            }
        }
        return false;
    }

    console.log(`✅ Compra activa encontrada en archivos para: ${sender}`);

    // ✅ LUEGO VERIFICAR ESTADO EN MEMORIA
    const userState = this.userStates.get(sender);
    if (!userState || !userState.esperandoComprobante) {
        console.log(`⚠️ Compra en archivos pero no en memoria para: ${sender}, sincronizando...`);
        this.sincronizarEstadoDesdeArchivos(sender, compraActivaEnArchivos);
        return true;
    }

    // Verificar si no ha expirado
    const tiempoTranscurrido = Date.now() - userState.timestampComprobante;
    const compraValida = tiempoTranscurrido <= this.TIEMPO_MAXIMO_COMPRA;

    console.log(`⏰ Estado compra ${sender}:`);
    console.log(`   - Tiempo transcurrido: ${Math.round(tiempoTranscurrido/1000)}s`);
    console.log(`   - Tiempo máximo: ${this.TIEMPO_MAXIMO_COMPRA/1000}s`);
    console.log(`   - Compra válida: ${compraValida}`);

    if (!compraValida) {
        console.log(`🕐 Compra expirada para ${sender}, limpiando estado...`);
        this.finalizarCompraActual(sender, 'expirada_automaticamente');
        return false;
    }

    return true;
}



/**
 * 🔄 SINCRONIZAR ESTADO DESDE ARCHIVOS - NUEVO MÉTODO
 */
sincronizarEstadoDesdeArchivos(sender, compraActiva) {
    try {
        if (!this.userStates.has(sender)) {
            this.userStates.set(sender, {});
        }

        const userState = this.userStates.get(sender);
        userState.esperandoComprobante = true;
        userState.datosCompraPendiente = compraActiva.datos_compra;
        userState.timestampComprobante = new Date(compraActiva.fecha).getTime();
        userState.intentosFallidos = 0;
        userState.compraActiva = true;

        console.log(`✅ Estado sincronizado desde archivos para: ${sender}`);

    } catch (error) {
        console.error(`❌ Error sincronizando estado desde archivos para ${sender}:`, error);
    }
}





/**
 * 🔍 OBTENER COMPRA ACTIVA SINCRÓNICAMENTE - NUEVO MÉTODO
 */
obtenerCompraActivaSync(sender) {
    try {
        const comprasDir = path.join(__dirname, '../compras_pendientes');
        if (!fs.existsSync(comprasDir)) return null;

        const files = fs.readdirSync(comprasDir);

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(comprasDir, file);
                const compraData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                if (compraData.usuario === sender && compraData.estado === 'pending') {
                    return compraData;
                }
            }
        }
        return null;
    } catch (error) {
        console.error('❌ Error obteniendo compra activa sync:', error);
        return null;
    }
}




async verificarCompraActiva(sender) {
    if (this.tieneCompraActiva(sender)) {
        const userState = this.userStates.get(sender);
        const tiempoRestante = this.TIEMPO_MAXIMO_COMPRA - (Date.now() - userState.timestampComprobante);
        const minutosRestantes = Math.ceil(tiempoRestante / (60 * 1000));

        await this.enviarMensajeSimple(sender,
            `🔄 *COMPRA EN PROCESO*\n\n` +
            `Tienes una compra pendiente de pago:\n\n` +
            `📦 *Stickers:* ${userState.datosCompraPendiente.cantidadStickers}\n` +
            `💰 *Monto pendiente:* $${this.formatearValor(userState.datosCompraPendiente.valorTotal)}\n` +
            `⏰ *Tiempo restante:* ${minutosRestantes} minutos\n\n` +
            `💡 *Para continuar:*\n` +
            `Envía únicamente la imagen del comprobante de pago.\n\n` +
            `📸 *¿Problemas con la imagen?*\n` +
            `Puedes enviar una nueva imagen para reemplazar la anterior.\n\n` +
            `🔄 *Si deseas cancelar:*\n` +
            `Espera a que expire el tiempo (${minutosRestantes} minutos)`
        );

        return true;
    }
    return false;
}




    async procesarMensajeEnCompra(sender, msg) {
    console.log('🔄 Procesando mensaje durante compra activa para:', sender);

    const messageType = Object.keys(msg.message || {})[0];
    const texto = this.extraerTextoMensaje(msg);

    console.log(`📨 Tipo mensaje: ${messageType}`);
    console.log(`📝 Contenido: ${texto}`);

    const userState = this.userStates.get(sender);

    // ✅ SI ES IMAGEN: Procesar comprobante (sustitución permitida)
    if (messageType === 'imageMessage') {
        console.log('🖼️ Imagen recibida durante compra, procesando comprobante...');
        await this.procesarSustitucionComprobante(sender, msg, userState);
        return;
    }

    // ✅ SI ES TEXTO Y ES NUEVA COMPRA: Bloquear y notificar
    if (this.esMensajeDeCompra(texto)) {
        console.log('🛑 Nueva compra detectada durante compra activa - BLOQUEADA');
        await this.notificarCompraActiva(sender);
        return;
    }

    // ✅ SI ES TEXTO NORMAL: Informar que necesita enviar comprobante
    if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        console.log('💬 Mensaje de texto durante compra activa');
        await this.solicitarComprobante(sender, userState);
        return;
    }

    // ❌ BLOQUEAR otros tipos de mensajes
    console.log('🚫 Tipo de mensaje no permitido durante compra activa');
    await this.solicitarComprobante(sender, userState);
}



/**
 * 🔄 SINCRONIZAR ESTADO CON ARCHIVOS - NUEVO MÉTODO
 */
async sincronizarEstadoConArchivos(sender) {
    try {
        console.log(`🔄 Sincronizando estado para: ${sender}`);

        const compraActiva = await this.obtenerCompraActiva(sender);

        if (compraActiva) {
            // ✅ SI HAY COMPRA ACTIVA EN ARCHIVOS, ACTIVAR ESTADO
            if (!this.userStates.has(sender)) {
                this.userStates.set(sender, {});
            }

            const userState = this.userStates.get(sender);
            userState.esperandoComprobante = true;
            userState.datosCompraPendiente = compraActiva.datos_compra;
            userState.timestampComprobante = new Date(compraActiva.fecha).getTime();
            userState.intentosFallidos = 0;
            userState.compraActiva = true;

            console.log(`✅ Estado sincronizado desde archivos para: ${sender}`);
        } else {
            // ✅ SI NO HAY COMPRA ACTIVA, LIMPIAR ESTADO
            if (this.userStates.has(sender)) {
                const userState = this.userStates.get(sender);
                if (userState.esperandoComprobante) {
                    console.log(`🔄 Limpiando estado obsoleto para: ${sender}`);
                    this.finalizarCompraActual(sender, 'sincronizacion_archivos');
                }
            }
        }

    } catch (error) {
        console.error(`❌ Error sincronizando estado para ${sender}:`, error);
    }
}





async solicitarComprobante(sender, userState) {
    try {
        const tiempoRestante = this.TIEMPO_MAXIMO_COMPRA - (Date.now() - userState.timestampComprobante);
        const minutosRestantes = Math.ceil(tiempoRestante / (60 * 1000));
        const intentosRestantes = 3 - (userState.intentosFallidos || 0);

        const mensaje = `📸 *COMPROBANTE REQUERIDO*\n\n` +
                       `Para completar tu compra, necesitamos que envíes la captura de pantalla del comprobante de pago.\n\n` +
                       `⏰ *Tiempo restante:* ${minutosRestantes} minutos\n` +
                       `📋 *Intentos restantes:* ${intentosRestantes}/3\n\n` +
                       `💡 *Instrucciones:*\n` +
                       `1. Toma captura de pantalla de tu transferencia\n` +
                       `2. Asegúrate que se vea el monto y los datos\n` +
                       `3. Envíala por este chat\n\n` +
                       `⚠️ *Si no envías el comprobante:*\n` +
                       `• En ${minutosRestantes} minutos la compra se cancelará\n` +
                       `• Después de ${intentosRestantes} intentos fallidos se cancelará\n\n` +
                       `🔄 *¿Tienes problemas?* Contacta a soporte: +57 3103134816`;

        await this.enviarMensajeSimple(sender, mensaje);
        console.log(`✅ Solicitando comprobante a ${sender}`);

    } catch (error) {
        console.error(`❌ Error solicitando comprobante a ${sender}:`, error);
    }
}




    async enviarMensajeBloqueado(sender, userState) {
        const datosCompra = userState.datosCompraPendiente;

        const mensaje = `🚫 *COMPRA EN PROCESO*\n\n` +
                       `Tienes una compra pendiente de pago:\n\n` +
                       `📦 *Stickers:* ${datosCompra.cantidadStickers}\n` +
                       `💰 *Monto pendiente:* $${this.formatearValor(datosCompra.valorTotal)}\n\n` +
                       `💡 *Para continuar:*\n` +
                       `Envía únicamente la imagen del comprobante de pago.\n\n` +
                       `📸 *¿Problemas con la imagen?*\n` +
                       `Puedes enviar una nueva imagen para reemplazar la anterior.\n\n` +
                       `🔄 *Si deseas cancelar:*\n` +
                       `Envía un nuevo mensaje de compra para reiniciar el proceso.`;

        await this.enviarMensajeSimple(sender, mensaje);
    }

  /*  async finalizarCompraActual(sender, razon) {
    console.log(`🛑 Finalizando compra para ${sender}. Razón: ${razon}`);

    if (this.userStates.has(sender)) {
        const userState = this.userStates.get(sender);

        // Limpiar estado de compra
        userState.esperandoComprobante = false;
        userState.datosCompraPendiente = null;
        userState.timestampComprobante = null;
        userState.intentosFallidos = 0; // Resetear contador

        // ✅ NUEVO: Limpiar cooldown solo si la compra se completó exitosamente
        if (razon === 'completada' || razon === 'aprobada') {
            this.compraCooldown.delete(sender);
            console.log(`🔓 Cooldown desactivado para ${sender}`);
        }

        console.log(`✅ Compra finalizada: ${sender} (${razon})`);
    }
}*/



async finalizarCompraActual(sender, razon) {
    console.log(`🛑 Finalizando compra para ${sender}. Razón: ${razon}`);

    // ✅ Siempre limpiar el estado en memoria, sin importar la razón
    this.limpiarEstadoUsuario(sender);

    console.log(`✅ Estado de compra finalizado: ${sender} (${razon})`);
}



    // =============================================
    // 📄 PROCESAMIENTO DE COMPROBANTES DE PAGO
    // =============================================
/*
    async procesarSustitucionComprobante(sender, msg, userState) {*/



async procesarSustitucionComprobante(sender, msg, userState) {
    try {
        console.log('🔄 Procesando sustitución de comprobante...');
        console.log(`📊 Estado actual de intentos: ${userState.intentosFallidos || 0}/3`);

        // Paso 1: Validar formato de imagen
        const esValida = await this.validarImagenComprobante(msg);

        if (!esValida) {
            // ✅ CONTAR INTENTOS FALLIDOS CORRECTAMENTE
            userState.intentosFallidos = (userState.intentosFallidos || 0) + 1;
            console.log(`❌ Intento fallido ${userState.intentosFallidos}/3 para ${sender}`);

            // ✅ VERIFICAR SI SUPERÓ EL LÍMITE DE INTENTOS
            if (userState.intentosFallidos >= 3) {
                console.log(`🚫 Límite de intentos alcanzado para ${sender}, cancelando compra...`);
                await this.cancelarCompraPorIntentosFallidos(sender, userState);
                return;
            }

            const intentosRestantes = 3 - userState.intentosFallidos;

            await this.enviarMensajeSimple(sender,
                `❌ *COMPROBANTE NO VÁLIDO* (Intento ${userState.intentosFallidos}/3)\n\n` +
                `El formato de imagen no es compatible.\n\n` +
                `✅ *Formatos aceptados:*\n` +
                `• JPEG/JPG\n` +
                `• PNG\n` +
                `• WebP\n\n` +
                `📸 *Recomendación:*\n` +
                `Toma una nueva captura y envíala nuevamente.\n\n` +
                `⚠️ *Intentos restantes:* ${intentosRestantes}/3\n` +
                `Después de 3 intentos fallidos, la compra se cancelará automáticamente.`
            );
            return;
        }

        // ✅ RESETEAR CONTADOR SI LA IMAGEN ES VÁLIDA
        userState.intentosFallidos = 0;
        console.log(`✅ Imagen válida, reset contador intentos para ${sender}`);

        // Paso 2: Verificar si es primera imagen o sustitución
        const esSustitucion = userState.comprobanteGuardado !== undefined;

        // Paso 3: Descargar y guardar nueva imagen
        const comprobanteGuardado = await this.guardarComprobante(sender, msg, userState);

        if (comprobanteGuardado) {
            // ✅ NUEVO: Actualizar compra con comprobante
            await this.actualizarCompraConComprobante(sender, comprobanteGuardado.filename);

            // Paso 4: Enviar mensaje informativo
            await this.informarRecepcionComprobante(sender, userState, esSustitucion);

            // Paso 5: Procesar pago en servidor
            await this.enviarPagoAServidor(sender, userState, comprobanteGuardado);

        } else {
            // ✅ TAMBIÉN CONTAR COMO INTENTO FALLIDO SI NO SE PUEDE GUARDAR
            userState.intentosFallidos = (userState.intentosFallidos || 0) + 1;
            console.log(`❌ Error guardando comprobante - Intento ${userState.intentosFallidos}/3`);

            if (userState.intentosFallidos >= 3) {
                console.log(`🚫 Límite de intentos alcanzado para ${sender}, cancelando compra...`);
                await this.cancelarCompraPorIntentosFallidos(sender, userState);
                return;
            }

            await this.enviarMensajeSimple(sender,
                `❌ *ERROR AL GUARDAR COMPROBANTE*\n\n` +
                `No pudimos procesar tu comprobante.\n\n` +
                `📞 Contacta a soporte: +57 3103134816`
            );
        }

    } catch (error) {
        console.error('❌ Error procesando sustitución de comprobante:', error);
        await this.enviarMensajeSimple(sender,
            `❌ *ERROR EN VERIFICACIÓN*\n\n` +
            `Ocurrió un error procesando tu comprobante.\n\n` +
            `📞 Contacta a soporte: +57 3103134816`
        );
    }
}



/*FIN*/


/**
 * 🚫 CANCELAR COMPRA POR LÍMITE DE INTENTOS FALLIDOS
 */
async cancelarCompraPorIntentosFallidos(sender, userState) {
    try {
        console.log(`🚫 Cancelando compra por intentos fallidos para: ${sender}`);

        // Buscar la compra activa del usuario
        const compraActiva = await this.obtenerCompraActiva(sender);

        if (compraActiva) {
            // Mover compra a canceladas
            const compraCancelada = await this.moverCompraACarpeta(
                compraActiva.id,
                'compras_canceladas',
                {
                    razon_cancelacion: 'Límite de intentos de comprobante excedido (3 intentos fallidos)',
                    fecha_cancelacion: new Date().toISOString(),
                    estado: 'cancelada',
                    intentos_fallidos: userState.intentosFallidos || 3
                }
            );

            // ✅ ELIMINAR COMPROBANTES GUARDADOS
            await this.limpiarComprobantesUsuario(sender);

            // Enviar mensaje de cancelación
            await this.enviarMensajeCancelacionPorIntentos(sender, compraCancelada);

            // Limpiar estado del usuario
            this.finalizarCompraActual(sender, 'intentos_agotados');

            console.log(`✅ Compra cancelada por intentos fallidos: ${sender}`);
        }

    } catch (error) {
        console.error('❌ Error cancelando compra por intentos fallidos:', error);
    }
}

/**
 * 🗑️ LIMPIAR COMPROBANTES DEL USUARIO
 */
async limpiarComprobantesUsuario(sender) {
    try {
        const comprobantesDir = path.join(__dirname, '../comprobantes');
        if (!fs.existsSync(comprobantesDir)) return;

        const files = fs.readdirSync(comprobantesDir);
        let eliminados = 0;

        for (const file of files) {
            if (file.includes(sender) && (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp'))) {
                const filePath = path.join(comprobantesDir, file);
                fs.unlinkSync(filePath);
                eliminados++;
                console.log(`🗑️ Comprobante eliminado: ${file}`);
            }
        }

        console.log(`✅ ${eliminados} comprobantes eliminados para ${sender}`);

    } catch (error) {
        console.error('❌ Error limpiando comprobantes:', error);
    }
}

/**
 * 💬 ENVIAR MENSAJE DE CANCELACIÓN POR INTENTOS
 */
async enviarMensajeCancelacionPorIntentos(sender, compra) {
    try {
        const mensaje = `🚫 *COMPRA CANCELADA*\n\n` +
                       `Tu compra ha sido cancelada automáticamente.\n\n` +
                       `📋 *Motivo de cancelación:*\n` +
                       `Has excedido el límite de 3 intentos para enviar un comprobante válido.\n\n` +
                       `📦 *Detalles de la compra cancelada:*\n` +
                       `• 🎫 Stickers: ${compra.total_stickers || compra.datos_compra?.cantidadStickers || 0}\n` +
                       `• 💰 Valor: $${(compra.valor_total || compra.datos_compra?.valorTotal || 0).toLocaleString()}\n\n` +
                       `🔄 *¿Qué puedes hacer?*\n` +
                       `• Verifica que tu comprobante sea legible antes de enviarlo\n` +
                       `• Asegúrate de que el monto sea correcto\n` +
                       `• Puedes iniciar una NUEVA compra enviando el mensaje de compra nuevamente\n\n` +
                       `📞 *Si necesitas ayuda:*\n` +
                       `Contacta a soporte: +57 3103134816\n\n` +
                       `_Los comprobantes enviados han sido eliminados del sistema_`;

        await this.enviarMensajeSimple(sender, mensaje);
        console.log(`✅ Mensaje de cancelación por intentos enviado a ${sender}`);

    } catch (error) {
        console.error(`❌ Error enviando mensaje de cancelación a ${sender}:`, error);
    }
}










    // Método para actualizar compra con comprobante
async actualizarCompraConComprobante(sender, nombreComprobante) {
    try {
        console.log(`🔍 Buscando compras para: ${sender} con comprobante: ${nombreComprobante}`);

        const comprasDir = path.join(__dirname, '../compras_pendientes');
        const files = fs.readdirSync(comprasDir);

        console.log(`📁 Archivos encontrados: ${files.length}`);

        let compraMasReciente = null;
        let fechaMasReciente = null;

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(comprasDir, file);
                const compraData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                console.log(`📄 Revisando archivo: ${file}`);
                console.log(`👤 Usuario en compra: ${compraData.usuario}, Esperado: ${sender}`);
                console.log(`📎 Comprobante actual: ${compraData.comprobante}`);
                console.log(`🕐 Fecha compra: ${compraData.fecha}`);

                if (compraData.usuario === sender && !compraData.comprobante) {
                    console.log(`✅ COMPRA VÁLIDA ENCONTRADA: ${compraData.id}`);

                    // Buscar la compra más reciente
                    if (!compraMasReciente || new Date(compraData.fecha) > new Date(fechaMasReciente)) {
                        compraMasReciente = compraData;
                        fechaMasReciente = compraData.fecha;
                    }
                }
            }
        }

        if (compraMasReciente) {
            console.log(`🎯 COMPRA MÁS RECIENTE SELECCIONADA: ${compraMasReciente.id}`);

            const filePath = path.join(comprasDir, `${compraMasReciente.id}.json`);
            compraMasReciente.comprobante = nombreComprobante;
            compraMasReciente.fecha_actualizacion = new Date().toISOString();

            fs.writeFileSync(filePath, JSON.stringify(compraMasReciente, null, 2));

            console.log(`✅ Comprobante agregado a compra más reciente: ${compraMasReciente.id}`);

            // Verificar que se guardó
            const compraVerificada = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`✅ Verificación - Comprobante ahora: ${compraVerificada.comprobante}`);

            // Emitir evento WebSocket
            if (this.websocket) {
                this.websocket.emit('comprobante_recibido', {
                    compraId: compraMasReciente.id,
                    usuario: sender,
                    comprobante: nombreComprobante
                });
            }

            return compraMasReciente;
        } else {
            console.log(`❌ No se encontró compra pendiente para ${sender} sin comprobante`);
            return null;
        }

    } catch (error) {
        console.error('❌ Error actualizando compra con comprobante:', error);
        return null;
    }
}


    async informarRecepcionComprobante(sender, userState, esSustitucion) {
    const datosCompra = userState.datosCompraPendiente;
    const intentosRestantes = 3 - (userState.intentosFallidos || 0);

    let mensaje;

    if (esSustitucion) {
        mensaje = `✅ *COMPROBANTE ACTUALIZADO*\n\n` +
                 `Hemos reemplazado exitosamente tu comprobante:\n\n` +
                 `📦 *Stickers:* ${datosCompra.cantidadStickers}\n` +
                 `💰 *Monto:* $${this.formatearValor(datosCompra.valorTotal)}\n\n` +
                 `🔍 *Verificando...*\n` +
                 `Estamos validando tu nuevo comprobante.\n\n` +
                 `⏳ *Tiempo estimado:* 2-5 minutos\n` +
                 `Te notificaremos cuando se complete la verificación.\n\n` +
                 `⚠️ *Intentos restantes:* ${intentosRestantes}/3`;
    } else {
        mensaje = `✅ *COMPROBANTE RECIBIDO*\n\n` +
                 `Hemos recibido tu comprobante de pago:\n\n` +
                 `📦 *Stickers:* ${datosCompra.cantidadStickers}\n` +
                 `💰 *Monto:* $${this.formatearValor(datosCompra.valorTotal)}\n\n` +
                 `🔍 *Verificando...*\n` +
                 `Estamos validando tu comprobante.\n\n` +
                 `⏳ *Tiempo estimado:* 2-5 minutos\n` +
                 `Te notificaremos cuando se complete la verificación.\n\n` +
                 `📸 *¿Necesitas enviar otra imagen?*\n` +
                 `Puedes enviar una nueva imagen para reemplazar esta.\n\n` +
                 `⚠️ *Intentos restantes:* ${intentosRestantes}/3`;
    }

    await this.enviarMensajeSimple(sender, mensaje);
    console.log(`✅ Mensaje de ${esSustitucion ? 'sustitución' : 'recepción'} enviado a ${sender}`);
}

    async validarImagenComprobante(msg) {
        try {
            const imageMessage = msg.message?.imageMessage;
            if (!imageMessage) return false;

            // Validar tipo MIME
            const mimeType = imageMessage.mimetype || '';
            const esMimeValido = this.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());

            // Validar tamaño
            const fileSize = imageMessage.fileLength || 0;
            const esTamanioValido = fileSize > 0 && fileSize <= this.MAX_FILE_SIZE;

            console.log(`🖼️ Validación imagen: ${mimeType} (${fileSize} bytes)`);
            console.log(`   - MIME válido: ${esMimeValido}`);
            console.log(`   - Tamaño válido: ${esTamanioValido}`);

            return esMimeValido && esTamanioValido;

        } catch (error) {
            console.error('❌ Error validando imagen:', error);
            return false;
        }
    }

    async guardarComprobante(sender, msg, userState) {
        try {
            const timestamp = Date.now();
            const comprasDir = path.join(__dirname, '../comprobantes');

            // ✅ SI YA EXISTE UN COMPROBANTE PREVIO, USAR EL MISMO NOMBRE
            let filename;
            if (userState.comprobanteGuardado) {
                // Extraer el nombre del archivo anterior
                const archivoAnterior = path.basename(userState.comprobanteGuardado);
                filename = archivoAnterior; // Mismo nombre para sobrescribir
                console.log(`🔄 Sobrescribiendo comprobante anterior: ${filename}`);
            } else {
                filename = `comprobante_${sender}_${timestamp}.jpg`;
                console.log(`💾 Creando nuevo comprobante: ${filename}`);
            }

            const filepath = path.join(comprasDir, filename);

            // Descargar la imagen
            const buffer = await downloadMediaMessage(msg, 'buffer', {});

            if (buffer) {
                // Guardar archivo (sobrescribe si existe)
                fs.writeFileSync(filepath, buffer);

                // Actualizar estado del usuario
                userState.comprobanteGuardado = filepath;
                userState.timestampComprobante = timestamp;
                userState.intentosComprobante = (userState.intentosComprobante || 0) + 1;

                console.log(`💾 Comprobante guardado: ${filename}`);
                console.log(`   - Intentos de comprobante: ${userState.intentosComprobante}`);
                this.stats.comprobantesRecibidos++;

                return {
                    filepath,
                    filename,
                    timestamp,
                    sender,
                    datosCompra: userState.datosCompraPendiente,
                    esSustitucion: userState.intentosComprobante > 1
                };
            }

            return null;

        } catch (error) {
            console.error('❌ Error guardando comprobante:', error);
            return null;
        }
    }

    async enviarPagoAServidor(sender, userState, comprobanteInfo) {
        try {
            console.log('🌐 Enviando pago a servidor...');

            // Informar que se está procesando
            if (comprobanteInfo.esSustitucion) {
                console.log(`🔄 Enviando comprobante sustituido para: ${sender}`);
            } else {
                console.log(`📤 Enviando comprobante inicial para: ${sender}`);
            }

            // Aquí iría la lógica real para enviar a tu API
            // Por ahora simulamos el envío

            await delay(2000); // Simular procesamiento

            console.log(`✅ Pago procesado para: ${sender}`);

            // Actualizar estadísticas
            this.stats.comprasProcesadas++;

        } catch (error) {
            console.error('❌ Error enviando pago a servidor:', error);
            throw error;
        }
    }

    // =============================================
    // ⚙️ FUNCIONALIDADES DE ADMINISTRACIÓN
    // =============================================

    async obtenerCompraPorId(compraId) {
        try {
            const carpetas = ['compras_pendientes', 'compras_completadas', 'compras_canceladas'];

            for (const carpeta of carpetas) {
                const carpetaPath = path.join(__dirname, `../${carpeta}`);
                if (fs.existsSync(carpetaPath)) {
                    const files = fs.readdirSync(carpetaPath);
                    for (const file of files) {
                        if (file.includes(compraId) && file.endsWith('.json')) {
                            const compraPath = path.join(carpetaPath, file);
                            const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));
                            console.log(`✅ Compra encontrada: ${compraId} en ${carpeta}`);
                            return compraData;
                        }
                    }
                }
            }

            console.log(`❌ Compra no encontrada: ${compraId}`);
            return null;

        } catch (error) {
            console.error('❌ Error obteniendo compra por ID:', error);
            return null;
        }
    }




async aprobarCompra(compraId, numerosStickers = [], datosPHP = null) {
    try {
        console.log(`✅ Aprobando compra ${compraId} con estructura minimalista`);
        console.log('📊 Datos PHP recibidos:', {
            purchaseId: datosPHP?.purchaseId,
            totalNumbers: datosPHP?.totalNumbers,
            numbersCount: numerosStickers?.length
        });

        // ✅ BUSCAR EN TODAS LAS CARPETAS
        const compra = await this.obtenerCompraPorId(compraId);
        if (!compra) {
            console.log(`❌ Compra no encontrada en ninguna carpeta: ${compraId}`);
            return { success: false, error: 'Compra no encontrada' };
        }

        console.log(`✅ Compra encontrada:`, {
            id: compra.id,
            usuario: compra.usuario,
            estado: compra.estado,
            total_stickers: compra.total_stickers
        });

        // ✅ LIMPIAR ESTADO EN MEMORIA INMEDIATAMENTE
        if (compra.usuario) {
            this.limpiarEstadoUsuario(compra.usuario);
            console.log(`🧹 Memoria limpiada para: ${compra.usuario}`);
        }

        // ✅ PREPARAR DATOS MINIMALISTAS
        const datosActualizacion = {
            numeros_stickers: numerosStickers,
            registro_web: {
                purchaseId: datosPHP?.purchaseId || null,
                totalNumbers: datosPHP?.totalNumbers || numerosStickers.length
            }
        };

        console.log('📝 Datos de actualización minimalistas:', datosActualizacion);

        // ✅ ACTUALIZAR LA COMPRA
        let compraActualizada;

        if (compra.estado === 'pending') {
            compraActualizada = await this.moverCompraACarpeta(
                compraId,
                'compras_completadas',
                datosActualizacion
            );
        } else {
            compraActualizada = await this.actualizarCompraExistente(compraId, {
                estado: 'completed',
                fecha_aprobacion: new Date().toISOString(),
                ...datosActualizacion
            });
        }

        if (!compraActualizada) {
            return { success: false, error: 'Error actualizando compra' };
        }

        // ✅ ENVIAR MENSAJE DE APROBACIÓN
        console.log(`💬 Enviando mensaje WhatsApp a: ${compra.usuario}`);
        const resultadoMensaje = await this.enviarMensajeAprobacion(
            compra.usuario,
            compraActualizada,
            numerosStickers,
            datosPHP
        );

        // Actualizar estadísticas
        this.stats.comprasProcesadas++;

        // Emitir evento WebSocket
        if (this.websocket) {
            this.websocket.emit('compra_aprobada', {
                compraId: compraId,
                usuario: compra.usuario,
                numerosStickers: numerosStickers,
                timestamp: new Date().toISOString(),
                nombreCliente: compra.nombre_cliente,
                purchaseIdWeb: datosPHP?.purchaseId,
                totalNumbers: datosPHP?.totalNumbers || numerosStickers.length
            });
        }

        console.log(`✅ Compra aprobada correctamente con estructura minimalista`);
        console.log(`   📝 ID interno: ${compraId}`);
        console.log(`   📊 ID BD PHP: ${datosPHP?.purchaseId}`);
        console.log(`   🔢 Números asignados: ${numerosStickers.length}`);

        return {
            success: true,
            compra: compraActualizada,
            mensajeEnviado: resultadoMensaje.success,
            memoriaLimpia: true
        };

    } catch (error) {
        console.error('❌ Error aprobando compra:', error);
        return { success: false, error: error.message };
    }
}



/*
    async aprobarCompra(compraId, numerosStickers = [], datosPHP = null) {
    try {
        console.log(`✅ Aprobando compra ${compraId} con estructura minimalista`);
        console.log('📊 Datos PHP recibidos:', {
            purchaseId: datosPHP?.purchaseId,
            totalNumbers: datosPHP?.totalNumbers,
            numbersCount: numerosStickers?.length
        });

        // ✅ BUSCAR EN TODAS LAS CARPETAS
        const compra = await this.obtenerCompraPorId(compraId);
        if (!compra) {
            console.log(`❌ Compra no encontrada en ninguna carpeta: ${compraId}`);
            return { success: false, error: 'Compra no encontrada' };
        }

        console.log(`✅ Compra encontrada:`, {
            id: compra.id,
            usuario: compra.usuario,
            estado: compra.estado,
            total_stickers: compra.total_stickers
        });

        // ✅ PREPARAR DATOS MINIMALISTAS
        const datosActualizacion = {
            numeros_stickers: numerosStickers,
            registro_web: {
                purchaseId: datosPHP?.purchaseId || null,
                totalNumbers: datosPHP?.totalNumbers || numerosStickers.length
            }
        };

        console.log('📝 Datos de actualización minimalistas:', datosActualizacion);

        // ✅ ACTUALIZAR LA COMPRA
        let compraActualizada;

        if (compra.estado === 'pending') {
            compraActualizada = await this.moverCompraACarpeta(
                compraId,
                'compras_completadas',
                datosActualizacion
            );
        } else {
            compraActualizada = await this.actualizarCompraExistente(compraId, {
                estado: 'completed',
                fecha_aprobacion: new Date().toISOString(),
                ...datosActualizacion
            });
        }

        if (!compraActualizada) {
            return { success: false, error: 'Error actualizando compra' };
        }

        // ✅ ENVIAR MENSAJE DE APROBACIÓN
        console.log(`💬 Enviando mensaje WhatsApp a: ${compra.usuario}`);
        const resultadoMensaje = await this.enviarMensajeAprobacion(
            compra.usuario,
            compraActualizada,
            numerosStickers,
            datosPHP
        );

        // Actualizar estadísticas
        this.stats.comprasProcesadas++;

        // Emitir evento WebSocket
        if (this.websocket) {
            this.websocket.emit('compra_aprobada', {
                compraId: compraId,
                usuario: compra.usuario,
                numerosStickers: numerosStickers,
                timestamp: new Date().toISOString(),
                nombreCliente: compra.nombre_cliente,
                purchaseIdWeb: datosPHP?.purchaseId,
                totalNumbers: datosPHP?.totalNumbers || numerosStickers.length
            });
        }

        console.log(`✅ Compra aprobada correctamente con estructura minimalista`);
        console.log(`   📝 ID interno: ${compraId}`);
        console.log(`   📊 ID BD PHP: ${datosPHP?.purchaseId}`);
        console.log(`   🔢 Números asignados: ${numerosStickers.length}`);

        return {
            success: true,
            compra: compraActualizada,
            mensajeEnviado: resultadoMensaje.success
        };

    } catch (error) {
        console.error('❌ Error aprobando compra:', error);
        return { success: false, error: error.message };
    }
}

*/




/**
 * 🔄 ACTUALIZAR COMPRA EXISTENTE SIN MOVERLA
 */
async actualizarCompraExistente(compraId, datosActualizacion) {
    try {
        console.log(`🔄 Actualizando compra existente: ${compraId}`);

        const carpetas = ['compras_pendientes', 'compras_completadas', 'compras_canceladas'];

        for (const carpeta of carpetas) {
            const carpetaPath = path.join(__dirname, `../${carpeta}`);
            if (fs.existsSync(carpetaPath)) {
                const files = fs.readdirSync(carpetaPath);
                for (const file of files) {
                    if (file.includes(compraId) && file.endsWith('.json')) {
                        const archivoPath = path.join(carpetaPath, file);
                        const compraData = JSON.parse(fs.readFileSync(archivoPath, 'utf8'));

                        // Actualizar datos
                        Object.assign(compraData, datosActualizacion);

                        // Guardar cambios
                        fs.writeFileSync(archivoPath, JSON.stringify(compraData, null, 2));

                        console.log(`✅ Compra ${compraId} actualizada en ${carpeta}`);
                        return compraData;
                    }
                }
            }
        }

        console.log(`❌ No se pudo encontrar compra para actualizar: ${compraId}`);
        return null;

    } catch (error) {
        console.error('❌ Error actualizando compra existente:', error);
        return null;
    }
}

/**
 * 🔍 OBTENER COMPRA POR ID (BUSCAR EN TODAS LAS CARPETAS)
 */
async obtenerCompraPorId(compraId) {
    try {
        console.log(`🔍 Buscando compra: ${compraId} en todas las carpetas...`);

        const carpetas = ['compras_pendientes', 'compras_completadas', 'compras_canceladas'];

        for (const carpeta of carpetas) {
            const carpetaPath = path.join(__dirname, `../${carpeta}`);
            if (fs.existsSync(carpetaPath)) {
                const files = fs.readdirSync(carpetaPath);
                console.log(`📁 Buscando en ${carpeta}: ${files.length} archivos`);

                for (const file of files) {
                    if (file.includes(compraId) && file.endsWith('.json')) {
                        const compraPath = path.join(carpetaPath, file);
                        const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));
                        console.log(`✅ Compra encontrada: ${compraId} en ${carpeta}`);
                        console.log(`📊 Estado actual: ${compraData.estado}`);
                        return compraData;
                    }
                }
            }
        }

        console.log(`❌ Compra no encontrada en ninguna carpeta: ${compraId}`);
        return null;

    } catch (error) {
        console.error('❌ Error obteniendo compra por ID:', error);
        return null;
    }
}





/*
    async rechazarCompra(compraId, razonRechazo) {
        try {
            console.log(`❌ Rechazando compra ${compraId}:`, razonRechazo);

            if (!compraId) {
                throw new Error('ID de compra es requerido');
            }

            // Limpiar y validar la razón
            let razonString = 'Comprobante de pago no válido';
            if (razonRechazo) {
                if (typeof razonRechazo === 'string') {
                    razonString = razonRechazo.trim();
                } else if (typeof razonRechazo === 'object') {
                    razonString = 'Comprobante de pago no válido o no legible';
                }
            }

            console.log(`📝 Razón final de rechazo: ${razonString}`);

            // Obtener compra
            const compra = await this.obtenerCompraPorId(compraId);
            if (!compra) {
                throw new Error(`Compra no encontrada: ${compraId}`);
            }

            // Mover a canceladas
            const resultado = await this.moverCompraACarpeta(
                compraId,
                'compras_canceladas',
                {
                    razon_rechazo: razonString,
                    fecha_rechazo: new Date().toISOString(),
                    estado: 'rechazada'
                }
            );

            if (!resultado) {
                throw new Error('Error moviendo compra');
            }

            // Resetear estado del usuario
            this.setUserState(compra.usuario, 'idle');

            // Enviar mensaje de rechazo
            await this.enviarMensajeRechazo(compra.usuario, razonString, compra);

            // Actualizar estadísticas
            this.stats.comprasRechazadas++;

            // Emitir evento WebSocket
            if (this.websocket) {
                this.websocket.emit('compra_rechazada', {
                    compraId: compraId,
                    usuario: compra.usuario,
                    razon: razonString,
                    timestamp: new Date().toISOString(),
                    nombreCliente: compra.nombre_cliente,
                    permiteNuevaCompra: true
                });
            }

            console.log(`✅ Compra ${compraId} rechazada correctamente`);
            return {
                success: true,
                compra: resultado,
                razonUtilizada: razonString
            };

        } catch (error) {
            console.error('❌ Error rechazando compra:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }*/


        async rechazarCompra(compraId, razonRechazo) {
    try {
        console.log(`❌ Rechazando compra ${compraId}:`, razonRechazo);

        if (!compraId) {
            throw new Error('ID de compra es requerido');
        }

        // Limpiar y validar la razón
        let razonString = 'Comprobante de pago no válido';
        if (razonRechazo) {
            if (typeof razonRechazo === 'string') {
                razonString = razonRechazo.trim();
            } else if (typeof razonRechazo === 'object') {
                razonString = 'Comprobante de pago no válido o no legible';
            }
        }

        console.log(`📝 Razón final de rechazo: ${razonString}`);

        // Obtener compra
        const compra = await this.obtenerCompraPorId(compraId);
        if (!compra) {
            throw new Error(`Compra no encontrada: ${compraId}`);
        }

        // ✅ LIMPIAR ESTADO EN MEMORIA INMEDIATAMENTE
        if (compra.usuario) {
            this.limpiarEstadoUsuario(compra.usuario);
            console.log(`🧹 Memoria limpiada para: ${compra.usuario}`);
        }

        // Mover a canceladas
        const resultado = await this.moverCompraACarpeta(
            compraId,
            'compras_canceladas',
            {
                razon_rechazo: razonString,
                fecha_rechazo: new Date().toISOString(),
                estado: 'rechazada'
            }
        );

        if (!resultado) {
            throw new Error('Error moviendo compra');
        }

        // Enviar mensaje de rechazo
        await this.enviarMensajeRechazo(compra.usuario, razonString, compra);

        // Actualizar estadísticas
        this.stats.comprasRechazadas++;

        // Emitir evento WebSocket
        if (this.websocket) {
            this.websocket.emit('compra_rechazada', {
                compraId: compraId,
                usuario: compra.usuario,
                razon: razonString,
                timestamp: new Date().toISOString(),
                nombreCliente: compra.nombre_cliente,
                permiteNuevaCompra: true
            });
        }

        console.log(`✅ Compra ${compraId} rechazada correctamente`);
        return {
            success: true,
            compra: resultado,
            razonUtilizada: razonString,
            memoriaLimpia: true
        };

    } catch (error) {
        console.error('❌ Error rechazando compra:', error);
        return {
            success: false,
            error: error.message
        };
    }
}



    // =============================================
// 💬 MÉTODOS DE MENSAJERÍA PARA RECHAZAR COMPRAS
// =============================================

async enviarMensajeRechazo(usuario, razon, compra) {
    try {
        const mensaje = `❌ *COMPRA RECHAZADA*\n\n` +
                       `Lamentamos informarte que tu compra ha sido rechazada.\n\n` +
                       `📋 *Detalles de la compra:*\n` +
                       `• 🎫 Stickers: ${compra.total_stickers || compra.datos_compra?.cantidadStickers || 0}\n` +
                       `• 💰 Valor: $${(compra.valor_total || compra.datos_compra?.valorTotal || 0).toLocaleString()}\n\n` +
                       `📝 *Razón del rechazo:*\n` +
                       `${razon}\n\n` +
                       `🔄 *¿Qué puedes hacer?*\n` +
                       `• Verifica que el comprobante sea legible\n` +
                       `• Asegúrate que el monto sea correcto\n` +
                       `• Puedes enviar un nuevo mensaje de compra\n\n` +
                       `📞 *Si necesitas ayuda:*\n` +
                       `Contacta a soporte: +57 3103134816`;

        await this.enviarMensajeSimple(usuario, mensaje);
        console.log(`✅ Mensaje de rechazo enviado a ${usuario}`);

        return { success: true };

    } catch (error) {
        console.error(`❌ Error enviando mensaje de rechazo a ${usuario}:`, error);
        return { success: false, error: error.message };
    }
}
async enviarMensajeAprobacion(usuario, compra, numerosStickers, datosPHP = null) {
    try {
        // ✅ FORMATEAR NÚMEROS CORRECTAMENTE
        let numerosStr = 'No asignados';
        if (numerosStickers && numerosStickers.length > 0) {
            // Unir con coma y espacio, sin coma al final
            numerosStr = numerosStickers.join(', ');
        }

        // ✅ USAR INFORMACIÓN DEL PHP SI ESTÁ DISPONIBLE
        const purchaseId = datosPHP?.purchaseId || compra.purchase_id_web || 'N/A';
        const idCompra = compra.id || 'N/A';
        const totalNumbers = datosPHP?.totalNumbers || numerosStickers?.length || 0;
        const userName = datosPHP?.user?.name || compra.nombre_cliente || 'Cliente';

        const mensaje = `🎉 *¡COMPRA APROBADA!* 🎉\n\n` +
                       `Hola *${userName}*, tu compra ha sido procesada exitosamente.\n\n` +
                       `📋 *Detalles de tu compra:*\n` +
                       `• 🎫 Stickers comprados: ${compra.total_stickers || compra.datos_compra?.cantidadStickers || 0}\n` +
                       `• 🔢 Números asignados: ${totalNumbers}\n` +
                       `• 💰 Valor: $${(compra.valor_total || compra.datos_compra?.valorTotal || 0).toLocaleString()}\n` +
                       `• 📝 ID de compra: ${purchaseId}\n\n` +
                       `🎯 *Tus números de la suerte:*\n` +
                       ` ${numerosStr}\n` +
                       `✨ *¡Mucha suerte!* ✨\n\n` +
                       `_Guarda este mensaje para reclamar tu premio_`;

        await this.enviarMensajeSimple(usuario, mensaje);
        console.log(`✅ Mensaje de aprobación enviado a ${usuario} con ID: ${purchaseId}`);

        return { success: true };

    } catch (error) {
        console.error(`❌ Error enviando mensaje de aprobación a ${usuario}:`, error);
        return { success: false, error: error.message };
    }
}







    async bloquearUsuario(numeroUsuario, razon) {
        try {
            const mensaje = `🚫 *CUENTA BLOQUEADA*\n\n` +
                           `Tu número ha sido *BLOQUEADO* en nuestro sistema.\n\n` +
                           `📝 *Motivo del bloqueo:*\n` +
                           `${razon}\n\n` +
                           `❌ *Consecuencias:*\n` +
                           `• No podrás realizar más compras\n` +
                           `• No podrás subir comprobantes\n` +
                           `• Todas las compras pendientes han sido canceladas\n\n` +
                           `📅 *Bloqueado el:* ${new Date().toLocaleString()}\n\n` +
                           `📞 *Para apelar esta decisión:*\n` +
                           `Contacta al administrador del sistema.\n\n` +
                           `_Este es un bloqueo temporal._`;

            const jid = this.formatJidForSending(numeroUsuario);
            const resultado = await this.sock.sendMessage(jid, { text: mensaje });

            this.stats.mensajesEnviados++;
            this.stats.usuariosBloqueados++;

            // Cancelar todas las compras pendientes del usuario
            await this.cancelarComprasUsuario(numeroUsuario, razon);

            return {
                success: true,
                messageId: resultado.key?.id,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error enviando mensaje de bloqueo:', error);
            return { success: false, error: error.message };
        }
    }

    // =============================================
    // 📊 MÉTODOS DE ESTADO Y ESTADÍSTICAS
    // =============================================

    verificarConexion() {
        return {
            conectado: this.initialized,
            estado: this.initialized ? 'ready' : 'disconnected',
            qrGenerado: this.qrGenerated,
            reconnectAttempts: this.reconnectAttempts,
            estadisticas: this.stats
        };
    }

    obtenerEstadisticas() {
        return {
            ...this.stats,
            conectado: this.initialized,
            reconexiones: this.reconnectAttempts
        };
    }

    // =============================================
    // 🛠️ MÉTODOS AUXILIARES (INTERNOS)
    // =============================================

  async moverCompraACarpeta(compraId, carpetaDestino, datosAdicionales = {}) {
    try {
        console.log(`🔄 Moviendo compra ${compraId} a ${carpetaDestino} con estructura minimalista`);

        const carpetasOrigen = ['compras_pendientes', 'compras_completadas', 'compras_canceladas'];
        let compraEncontrada = null;
        let archivoOrigen = null;

        // Buscar en todas las carpetas
        for (const carpeta of carpetasOrigen) {
            const carpetaPath = path.join(__dirname, `../${carpeta}`);
            if (fs.existsSync(carpetaPath)) {
                const files = fs.readdirSync(carpetaPath);
                for (const file of files) {
                    if (file.includes(compraId) && file.endsWith('.json')) {
                        archivoOrigen = path.join(carpetaPath, file);
                        compraEncontrada = JSON.parse(fs.readFileSync(archivoOrigen, 'utf8'));
                        console.log(`✅ Compra encontrada en: ${carpeta}`);
                        break;
                    }
                }
            }
            if (compraEncontrada) break;
        }

        if (!compraEncontrada) {
            console.log(`❌ Compra no encontrada para mover: ${compraId}`);
            return null;
        }

        // ✅ ESTRUCTURA MINIMALISTA Y LIMPIA
        const compraLimpia = {
            // Información básica
            id: compraEncontrada.id,
            usuario: compraEncontrada.usuario,
            nombre_cliente: compraEncontrada.nombre_cliente,
            total_stickers: compraEncontrada.total_stickers,
            valor_total: compraEncontrada.valor_total,
            fecha: compraEncontrada.fecha,

            // Estado y fechas
            estado: 'completed',
            fecha_aprobacion: new Date().toISOString(),
            fecha_actualizacion: new Date().toISOString(),

            // Comprobante
            comprobante: compraEncontrada.comprobante || null,

            // Números asignados
            numeros_stickers: datosAdicionales.numeros_stickers || [],

            // Información de registro (solo lo esencial)
            purchase_id_web: datosAdicionales.registro_web?.purchaseId || null,
            total_numbers_web: datosAdicionales.registro_web?.totalNumbers || 0
        };

        console.log('📝 Estructura minimalista creada:', {
            id: compraLimpia.id,
            usuario: compraLimpia.usuario,
            total_stickers: compraLimpia.total_stickers,
            numeros_stickers_count: compraLimpia.numeros_stickers.length,
            purchase_id_web: compraLimpia.purchase_id_web
        });

        // Guardar en nueva ubicación
        const destinoPath = path.join(__dirname, `../${carpetaDestino}`, path.basename(archivoOrigen));
        fs.writeFileSync(destinoPath, JSON.stringify(compraLimpia, null, 2));

        // Eliminar archivo original si no es la misma carpeta
        if (!archivoOrigen.includes(carpetaDestino)) {
            fs.unlinkSync(archivoOrigen);
            console.log(`🗑️ Archivo original eliminado: ${archivoOrigen}`);
        }

        console.log(`✅ Compra ${compraId} movida a ${carpetaDestino} con estructura minimalista`);
        return compraLimpia;

    } catch (error) {
        console.error('❌ Error moviendo compra:', error);
        return null;
    }
}





    setUserState(numero, estado) {
        // Método interno para establecer estado de usuario
        if (!this.userStates.has(numero)) {
            this.userStates.set(numero, {});
        }
        this.userStates.get(numero).estado = estado;
    }

    async cancelarComprasUsuario(numeroUsuario, razon) {
        // Método interno para cancelar compras de un usuario
        try {
            const comprasPendientesDir = path.join(__dirname, '../compras_pendientes');
            if (fs.existsSync(comprasPendientesDir)) {
                const files = fs.readdirSync(comprasPendientesDir);
                for (const file of files) {
                    if (file.includes(numeroUsuario) && file.endsWith('.json')) {
                        const compraPath = path.join(comprasPendientesDir, file);
                        const compraData = JSON.parse(fs.readFileSync(compraPath, 'utf8'));

                        // Mover a canceladas
                        await this.moverCompraACarpeta(
                            compraData.compraId,
                            'compras_canceladas',
                            {
                                razon_rechazo: `Usuario bloqueado: ${razon}`,
                                fecha_rechazo: new Date().toISOString(),
                                estado: 'cancelada_por_bloqueo'
                            }
                        );
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error cancelando compras de usuario:', error);
        }
    }
 }

export default WhatsAppModule;
