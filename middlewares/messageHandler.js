// middlewares/messageHandler.js - MANEJADOR DE MENSAJES CON SEGURIDAD
import SecurityMiddleware from './securityMiddleware.js';
import RateLimitMiddleware from './rateLimitMiddleware.js';

class MessageHandler {
    constructor() {
        this.initialized = false;
        this.security = null;
        this.rateLimit = null;
    }

    async initialize(app, modules) {
        this.modules = modules;

        // Inicializar middlewares de seguridad
        this.security = new SecurityMiddleware();
        await this.security.initialize(app, modules);

        this.rateLimit = new RateLimitMiddleware();
        await this.rateLimit.initialize(app, modules);

        this.initialized = true;
        console.log('💬 MessageHandler con seguridad inicializado');
    }

    // 🖼️ Procesar mensaje con imagen (comprobante)
    async handleImageMessage(messageData) {
        try {
            const { userNumber, imageBuffer, fileName, messageId } = messageData;

            console.log(`🖼️ Procesando imagen de usuario ${userNumber}: ${fileName}`);

            // 1. 🔒 Verificar si usuario está bloqueado
            if (this.security.isUserBlocked(userNumber)) {
                await this.notifyBlockedUser(userNumber);
                return { success: false, error: 'Usuario bloqueado' };
            }

            // 2. 🚦 Verificar rate limit
            const rateLimitCheck = await this.rateLimit.checkRateLimit(userNumber, 'upload');
            if (!rateLimitCheck.allowed) {
                await this.notifyRateLimitExceeded(userNumber, rateLimitCheck.reason);
                this.security.logUploadAttempt(userNumber, fileName, false, `Rate limit: ${rateLimitCheck.reason}`);
                return { success: false, error: rateLimitCheck.reason };
            }

            // 3. 🔍 Verificar duplicados
            const isDuplicate = await this.security.checkDuplicateFile(imageBuffer, fileName, userNumber);
            if (isDuplicate) {
                await this.notifyDuplicateFile(userNumber);
                this.security.logUploadAttempt(userNumber, fileName, false, 'Archivo duplicado');
                return { success: false, error: 'Archivo ya fue procesado anteriormente' };
            }

            // 4. ✅ Procesar imagen (tu lógica existente aquí)
            const processingResult = await this.processImageUpload(messageData);

            if (processingResult.success) {
                this.security.logUploadAttempt(userNumber, fileName, true, 'Procesado exitosamente');

                // Emitir evento WebSocket para actualizar panel admin en tiempo real
                if (this.modules.websocket) {
                    this.modules.websocket.emit('new_upload', {
                        userNumber: userNumber,
                        fileName: fileName,
                        timestamp: new Date().toISOString(),
                        compraId: processingResult.compraId
                    });
                }
            }

            return processingResult;

        } catch (error) {
            console.error('❌ Error procesando imagen:', error);
            return { success: false, error: error.message };
        }
    }

    // 📝 Procesar mensaje de texto
    async handleTextMessage(messageData) {
        try {
            const { userNumber, text, messageId } = messageData;

            console.log(`📝 Procesando texto de usuario ${userNumber}: ${text.substring(0, 50)}...`);

            // Verificar rate limit para mensajes de texto también
            const rateLimitCheck = await this.rateLimit.checkRateLimit(userNumber, 'message');
            if (!rateLimitCheck.allowed) {
                return { success: false, error: rateLimitCheck.reason };
            }

            // Procesar mensaje de compra
            if (text.includes('¡Quiero comprar estos stickers!')) {
                return await this.handlePurchaseMessage(userNumber, text);
            }

            // Verificar si tiene compra pendiente
            const tieneCompraPendiente = await this.checkPendingPurchase(userNumber);
            if (tieneCompraPendiente) {
                return await this.handlePurchaseInProgress(userNumber, text);
            }

            // Respuesta automática para otros mensajes
            return await this.sendAutoResponse(userNumber);

        } catch (error) {
            console.error('❌ Error procesando texto:', error);
            return { success: false, error: error.message };
        }
    }

    // 🛒 Procesar mensaje de compra
    async handlePurchaseMessage(userNumber, text) {
        try {
            console.log(`🛒 [COMPRA DETECTADA] De: ${userNumber}`);

            // Resetear intentos fallidos
            if (this.modules.whatsapp) {
                this.modules.whatsapp.resetFailedAttempts(userNumber);
            }

            // Parsear datos de compra del mensaje
            const compraData = this.parsePurchaseMessage(text);
            
            // Validar usuario remoto
            const usuarioValido = await this.validateRemoteUser(userNumber);
            if (!usuarioValido) {
                await this.requestRegistration(userNumber);
                return { success: false, error: 'Usuario no registrado' };
            }

            // Procesar compra
            const result = await this.processPurchase(userNumber, compraData);
            return result;

        } catch (error) {
            console.error('❌ Error procesando compra:', error);
            return { success: false, error: error.message };
        }
    }

    // 🔄 Procesar upload de imagen
    async processImageUpload(messageData) {
        try {
            const { userNumber, imageBuffer, fileName } = messageData;

            console.log(`📸 [COMPROBANTE] Procesando de ${userNumber}`);

            // Guardar comprobante
            const comprobanteId = await this.saveReceipt(userNumber, imageBuffer, fileName);
            
            // Actualizar compra con comprobante
            await this.updatePurchaseWithReceipt(userNumber, comprobanteId);

            // Emitir evento de comprobante recibido
            if (this.modules.websocket) {
                this.modules.websocket.emit('comprobante_recibido', {
                    usuario: userNumber,
                    comprobanteId: comprobanteId,
                    timestamp: new Date().toISOString(),
                    compraActualizada: await this.getUpdatedPurchase(userNumber)
                });
            }

            // Enviar confirmación al usuario
            if (this.modules.whatsapp) {
                await this.modules.whatsapp.enviarMensaje(userNumber, 
                    `📸 *COMPROBANTE RECIBIDO*\n\nHemos recibido tu comprobante de pago.\n⏳ Estamos validando el pago...\n\nTe notificaremos cuando tu compra sea aprobada.\n\n📞 Si tienes preguntas: +57 3103134816\n\n¡Gracias por tu compra! 🏍️`
                );
            }

            console.log(`✅ Comprobante procesado para ${userNumber}`);
            return { 
                success: true, 
                compraId: comprobanteId,
                message: 'Comprobante procesado exitosamente' 
            };

        } catch (error) {
            console.error('❌ Error procesando comprobante:', error);
            return { success: false, error: error.message };
        }
    }

    // 💬 Notificaciones al usuario
    async notifyBlockedUser(userNumber) {
        if (this.modules.whatsapp) {
            const message = `🚫 *CUENTA BLOQUEADA*\n\nTu cuenta ha sido bloqueada y no puedes subir comprobantes.\n\nContacta con soporte para más información.`;
            await this.modules.whatsapp.enviarMensaje(userNumber, message);
        }
    }

    async notifyRateLimitExceeded(userNumber, reason) {
        if (this.modules.whatsapp) {
            const message = `⏰ *LÍMITE EXCEDIDO*\n\n${reason}\n\nPor favor espera antes de intentar nuevamente.`;
            await this.modules.whatsapp.enviarMensaje(userNumber, message);
        }
    }

    async notifyDuplicateFile(userNumber) {
        if (this.modules.whatsapp) {
            const message = `🔄 *ARCHIVO DUPLICADO*\n\nEste comprobante ya fue procesado anteriormente.\n\nSi crees que es un error, contacta con soporte.`;
            await this.modules.whatsapp.enviarMensaje(userNumber, message);
        }
    }

    // 📊 Obtener estadísticas de seguridad
    getSecurityStats() {
        return {
            duplicateBlocks: this.security.fileHashes.size,
            rateLimitedUsers: this.rateLimit.userUploads.size,
            temporarilyBlocked: this.rateLimit.blockedUsers.size
        };
    }

    // 🔍 Métodos auxiliares
    async checkPendingPurchase(userNumber) {
        // Lógica para verificar compras pendientes
        return false;
    }

    async handlePurchaseInProgress(userNumber, text) {
        // Lógica para manejar compra en progreso
        return { success: true, processed: true };
    }

    async sendAutoResponse(userNumber) {
        if (this.modules.whatsapp) {
            await this.modules.whatsapp.enviarMensaje(userNumber,
                `🤖 ¡Hola! Soy el asistente de *Sticker Rueda y Gana* 🏍️\n\nPara comprar stickers, visita nuestra web y envía el mensaje de compra:\n🌐 https://stickeruedaygana.com\n\n📞 Soporte: +57 3103134816`
            );
        }
        return { success: true, processed: true };
    }

    parsePurchaseMessage(text) {
        // Lógica para parsear mensaje de compra
        return {
            timestamp: new Date().toISOString(),
            items: []
        };
    }

    async validateRemoteUser(userNumber) {
        // Lógica para validar usuario remoto
        return true;
    }

    async requestRegistration(userNumber) {
        if (this.modules.whatsapp) {
            await this.modules.whatsapp.enviarMensaje(userNumber,
                `📝 *REGISTRO REQUERIDO*\n\nPara comprar stickers necesitas estar registrado en nuestro sistema.\n\n🌐 Por favor visita:\nhttps://stickeruedaygana.com\n\n📝 Regístrate en la página web y luego vuelve a enviar el mensaje de compra.\n\n📞 Si necesitas ayuda: +57 3103134816`
            );
        }
    }

    async processPurchase(userNumber, compraData) {
        // Lógica para procesar compra
        return { success: true, compraId: `compra_${Date.now()}` };
    }

    async saveReceipt(userNumber, imageBuffer, fileName) {
        // Lógica para guardar comprobante
        return `comprobante_${userNumber}_${Date.now()}.jpg`;
    }

    async updatePurchaseWithReceipt(userNumber, comprobanteId) {
        // Lógica para actualizar compra con comprobante
        return true;
    }

    async getUpdatedPurchase(userNumber) {
        // Lógica para obtener compra actualizada
        return null;
    }
}

export default MessageHandler;
