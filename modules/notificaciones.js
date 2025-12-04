// modules/notificaciones.js
class NotificacionesService {
    constructor(whatsappModule) {
        this.whatsapp = whatsappModule;
    }

    /**
     * ✅ Notificar aprobación de compra
     */
    async notificarAprobacion(compra) {
        if (!this.whatsapp) {
            console.warn('⚠️ Módulo WhatsApp no disponible para notificaciones');
            return { success: false, error: 'WhatsApp no disponible' };
        }

        try {
            const resultado = await this.whatsapp.aprobarCompra(
                compra.usuario,
                compra
            );

            console.log(`✅ Notificación de aprobación enviada a ${compra.usuario}`);
            return resultado;

        } catch (error) {
            console.error('❌ Error enviando notificación de aprobación:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ❌ Notificar rechazo de compra
     */
    async notificarRechazo(compra, razon) {
        if (!this.whatsapp) {
            console.warn('⚠️ Módulo WhatsApp no disponible para notificaciones');
            return { success: false, error: 'WhatsApp no disponible' };
        }

        try {
            const resultado = await this.whatsapp.rechazarCompra(
                compra.usuario,
                compra,
                razon
            );

            console.log(`❌ Notificación de rechazo enviada a ${compra.usuario}`);
            return resultado;

        } catch (error) {
            console.error('❌ Error enviando notificación de rechazo:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 🚫 Notificar bloqueo de usuario
     */
    async notificarBloqueo(usuario, razon) {
        if (!this.whatsapp) {
            console.warn('⚠️ Módulo WhatsApp no disponible para notificaciones');
            return { success: false, error: 'WhatsApp no disponible' };
        }

        try {
            const resultado = await this.whatsapp.bloquearUsuario(
                usuario,
                razon
            );

            console.log(`🚫 Notificación de bloqueo enviada a ${usuario}`);
            return resultado;

        } catch (error) {
            console.error('❌ Error enviando notificación de bloqueo:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 🔍 Verificar estado del servicio
     */
    verificarEstado() {
        return {
            whatsappDisponible: !!this.whatsapp,
            estadoWhatsapp: this.whatsapp ? this.whatsapp.verificarConexion() : 'no disponible'
        };
    }
}

export default NotificacionesService;
