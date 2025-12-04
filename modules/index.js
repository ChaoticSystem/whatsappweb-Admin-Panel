// modules/index.js - VERSIÓN COMPLETA Y CORREGIDA
import WhatsAppModule from './whatsapp.js';

class ModulesManager {
    constructor() {
        this.modules = new Map();
        this.io = null;
        this.initialized = false;
    }

    async initialize(io) {
        console.log('📦 Inicializando módulos...');
        this.io = io;

        try {
            // 📱 Inicializar WhatsApp PRIMERO (módulo principal)
            console.log('🚀 Inicializando módulo WhatsApp...');
            const whatsappModule = new WhatsAppModule();
            await whatsappModule.initialize(io);
            this.modules.set('whatsapp', whatsappModule);
            console.log('✅ Módulo de WhatsApp inicializado');

            // 🗄️ Si necesitas otros módulos, los agregas aquí:
            /*
            console.log('🗄️ Inicializando módulo de base de datos...');
            const databaseModule = new DatabaseModule();
            await databaseModule.initialize();
            this.modules.set('database', databaseModule);
            console.log('✅ Módulo de base de datos inicializado');

            console.log('🔐 Inicializando módulo de autenticación...');
            const authModule = new AuthModule(databaseModule);
            await authModule.initialize();
            this.modules.set('auth', authModule);
            console.log('✅ Módulo de autenticación inicializado');
            */

            this.initialized = true;
            console.log('🎉 Todos los módulos inicializados correctamente');
            
            // Verificar que los métodos estén disponibles
            this.verifyMethods();
            
            return this;

        } catch (error) {
            console.error('❌ Error inicializando módulos:', error);
            this.initialized = false;
            throw error;
        }
    }

    // 🔍 VERIFICAR QUE LOS MÉTODOS ESTÉN DISPONIBLES
    verifyMethods() {
        console.log('🔍 Verificando métodos disponibles...');
        
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp) {
            const methods = [
                'verificarConexion',
                'obtenerEstadisticas', 
                'obtenerVerificacionesNumeros',
                'aprobarCompra',
                'rechazarCompra',
                'bloquearUsuario',
                'enviarMensaje',
                'enviarMensajeIntervencion',
                'validarUsuarioRemoto',
                'validarCompraCompleta'
            ];
            
            methods.forEach(method => {
                const exists = typeof whatsapp[method] === 'function';
                console.log(`   ${exists ? '✅' : '❌'} ${method}: ${exists ? 'DISPOIBLE' : 'FALTANTE'}`);
            });
        } else {
            console.log('❌ Módulo WhatsApp no encontrado para verificación');
        }
    }

    // 🔍 OBTENER MÓDULO - MÉTODO PRINCIPAL
    getModule(moduleName) {
        if (!this.initialized) {
            console.warn('⚠️ Módulos no inicializados aún');
            return null;
        }

        const module = this.modules.get(moduleName);
        if (!module) {
            console.warn(`⚠️ Módulo "${moduleName}" no encontrado. Módulos disponibles:`, [...this.modules.keys()]);
            return null;
        }
        
        return module;
    }

    // 📊 OBTENER ESTADO DE WHATSAPP (método conveniente)
    getWhatsAppStatus() {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.verificarConexion === 'function') {
            return whatsapp.verificarConexion();
        }
        return {
            conectado: false,
            estado: 'modulo_no_disponible',
            error: 'Módulo WhatsApp no disponible'
        };
    }

    // 📈 OBTENER ESTADÍSTICAS DE WHATSAPP
    getWhatsAppStats() {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.obtenerEstadisticas === 'function') {
            return whatsapp.obtenerEstadisticas();
        }
        return { error: 'Módulo WhatsApp no disponible' };
    }

    // 🔢 OBTENER VERIFICACIONES DE NÚMEROS
    getWhatsAppVerifications() {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.obtenerVerificacionesNumeros === 'function') {
            return whatsapp.obtenerVerificacionesNumeros();
        }
        return [];
    }

    // ✅ APROBAR COMPRA
    async approvePurchase(numeroCliente, datosCompra) {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.aprobarCompra === 'function') {
            return await whatsapp.aprobarCompra(numeroCliente, datosCompra);
        }
        return { success: false, error: 'Módulo WhatsApp no disponible' };
    }

    // ❌ RECHAZAR COMPRA
    async rejectPurchase(numeroCliente, datosCompra, razon) {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.rechazarCompra === 'function') {
            return await whatsapp.rechazarCompra(numeroCliente, datosCompra, razon);
        }
        return { success: false, error: 'Módulo WhatsApp no disponible' };
    }

    // 🔒 BLOQUEAR USUARIO
    async blockUser(numeroUsuario, razon) {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.bloquearUsuario === 'function') {
            return await whatsapp.bloquearUsuario(numeroUsuario, razon);
        }
        return { success: false, error: 'Módulo WhatsApp no disponible' };
    }

    // 📤 ENVIAR MENSAJE
    async sendMessage(dest, texto) {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.enviarMensaje === 'function') {
            return await whatsapp.enviarMensaje(dest, texto);
        }
        return { success: false, error: 'Módulo WhatsApp no disponible' };
    }

    // 🛠️ VALIDAR USUARIO
    async validateUser(numero, textoMensaje = '') {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp && typeof whatsapp.validarUsuarioRemoto === 'function') {
            return await whatsapp.validarUsuarioRemoto(numero, textoMensaje);
        }
        return { valido: false, error: 'Módulo WhatsApp no disponible' };
    }

    // 📋 OBTENER TODOS LOS MÓDULOS
    getAllModules() {
        return Object.fromEntries(this.modules);
    }

    // 🔧 VERIFICAR ESTADO DE TODOS LOS MÓDULOS
    getModulesStatus() {
        const status = {
            initialized: this.initialized,
            totalModules: this.modules.size,
            modules: {}
        };

        for (const [name, module] of this.modules) {
            status.modules[name] = {
                loaded: !!module,
                // Estado específico de WhatsApp
                ...(name === 'whatsapp' ? {
                    connected: module.initialized || false,
                    status: typeof module.verificarConexion === 'function' ? 
                           module.verificarConexion().estado : 'unknown'
                } : {})
            };
        }

        return status;
    }

    // 🔄 REINICIALIZAR WHATSAPP
    async restartWhatsApp() {
        const whatsapp = this.getModule('whatsapp');
        if (whatsapp) {
            console.log('🔄 Reiniciando módulo WhatsApp...');
            try {
                await whatsapp.cleanup();
                await whatsapp.startConnection();
                return { success: true, message: 'WhatsApp reiniciado' };
            } catch (error) {
                console.error('❌ Error reiniciando WhatsApp:', error);
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: 'Módulo WhatsApp no disponible' };
    }
}

// Crear y exportar una única instancia
const modulesInstance = new ModulesManager();
export default modulesInstance;
