// config/whatsapp-config.js
const whatsappConfig = {
    baileys: {
        // 🔧 CONFIGURACIÓN PRINCIPAL
        version: "2.3000.0", // Versión de WhatsApp Web
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Identificación del navegador
        syncFullHistory: false, // No sincronizar historial completo
        markOnlineOnConnect: true, // Mostrar como en línea al conectar
        generateHighQualityLinkPreview: true, // Previews de enlaces en alta calidad
        
        // 🔄 CONFIGURACIÓN DE RECONEXIÓN
        retryRequestDelayMs: 1000, // Delay entre reintentos
        maxRetries: 3, // Máximo de reintentos por mensaje
        connectTimeoutMs: 60000, // Timeout de conexión (60 segundos)
        
        // 📱 CONFIGURACIÓN DE MENSAJES
        defaultQueryTimeoutMs: 60000, // Timeout para consultas
        keepAliveIntervalMs: 15000, // Intervalo de keep-alive
        
        // 🔐 CONFIGURACIÓN DE SEGURIDAD
        emitOwnEvents: true, // Emitir eventos propios
        fireInitQueries: true, // Ejecutar consultas de inicialización
        shouldIgnoreJid: (jid) => false, // No ignorar ningún JID
        
        // 🚀 CONFIGURACIÓN DE RENDIMIENTO
        transactionOpts: {
            maxRetries: 3,
            delayInMs: 1000
        },
        // 🔥 CONFIGURACIÓN PARA EVITAR ERROR 515
        ws: {
            version: 13,
            origin: 'https://web.whatsapp.com'
        }
    },
    
    sessionConfig: {
        clientId: "sticker-bot-prod",
        dataPath: "./sessions",
        backupSyncIntervalMs: 300000, // Backup cada 5 minutos
        sessionTimeoutMs: 1800000 // Timeout de sesión 30 minutos
    },
    
    // 📊 CONFIGURACIÓN DEL BOT
    botConfig: {
        maxFileSize: 10 * 1024 * 1024, // 10MB máximo
        allowedMediaTypes: ['imageMessage'],
        allowedMimeTypes: [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/webp'
        ],
        maxAttempts: 3, // Intentos máximos para comprobantes
        attemptTimeout: 10 * 60 * 1000 // 10 minutos por intento
    },
    
    // 🌐 CONFIGURACIÓN DE API
    apiConfig: {
        remoteBase: "https://stickeruedaygana.com",
        checkPath: "/api/getUserData.php",
        registerPurchasePath: "/api/registerPurchase.php", // ✅ PATH PARA REGISTRAR COMPRA
        timeout: 10000 // 10 segundos timeout para API
    },

    // 💰 CONFIGURACIÓN DE COMPRAS
    purchaseConfig: {
        currency: "COP",
        currencySymbol: "$",
        paymentMethods: ["BRE-B"],
        paymentKey: "@DAVISTIKRUEDGANA",
        supportPhone: "+57 3103134816",
        keyImagePath: "./img/llave.png" // ✅ RUTA DE LA IMAGEN DE LA LLAVE
    }
};

export default whatsappConfig;
