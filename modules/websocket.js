// modules/websocket.js - VERSIÓN CORREGIDA Y COMPLETA
import { Server as socketIo } from 'socket.io'; // ← CORREGIDO

class WebSocketModule {
    constructor() {
        this.io = null;
        this.connections = new Map();
        this.adminRooms = new Set();
    }

    async initialize(server) {
        this.io = new socketIo(server, { // ← CORREGIDO (new socketIo)
            cors: {
                origin: [
                    "http://31.97.138.100:3000",
                    "http://localhost:3000",
                    "http://127.0.0.1:3000"
                ],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        this.setupEventHandlers();
        console.log('✅ WebSocket Module inicializado correctamente');
        return this;
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log('🔌 Cliente WebSocket conectado:', socket.id);
            this.connections.set(socket.id, socket);

            // 🔥 EVENTO DE CONEXIÓN INICIAL
            socket.emit('connected', {
                message: 'Conectado al servidor WebSocket',
                timestamp: new Date().toISOString(),
                clientId: socket.id
            });

            // 🔥 UNIRSE AL PANEL ADMIN - ESTO ES LO QUE FALTABA
            socket.on('join_admin', () => {
                socket.join('admin_room');
                this.adminRooms.add(socket.id);
                console.log(`👨‍💼 Cliente ${socket.id} unido a sala admin`);

                socket.emit('admin_joined', {
                    message: 'Conectado al panel administrativo',
                    timestamp: new Date().toISOString()
                });
            });

            // 🔥 SOLICITAR ESTADO ACTUAL
            socket.on('get_status', () => {
                console.log('📡 Cliente solicitó estado del sistema');
                // Emitir estado actual de todos los módulos
                this.emitSystemStatus(socket);
            });

            // 🔥 SOLICITAR DATOS INICIALES
            socket.on('get_initial_data', () => {
                console.log('📊 Cliente solicitó datos iniciales');
                // Aquí podrías emitir el estado actual de compras, etc.
                socket.emit('initial_data_loaded', {
                    message: 'Datos iniciales cargados',
                    timestamp: new Date().toISOString()
                });
            });

            // MANEJAR DESCONEXIÓN
            socket.on('disconnect', (reason) => {
                console.log(`🔌 Cliente ${socket.id} desconectado:`, reason);
                this.connections.delete(socket.id);
                this.adminRooms.delete(socket.id);
            });

            // MANEJAR ERRORES
            socket.on('error', (error) => {
                console.error(`🔥 Error en cliente ${socket.id}:`, error);
            });
        });
    }

    // 🔥 MÉTODO PARA EMITIR ESTADO DEL SISTEMA
    emitSystemStatus(socket = null) {
        const statusData = {
            websocket: {
                connections: this.connections.size,
                adminConnections: this.adminRooms.size,
                status: 'online'
            },
            timestamp: new Date().toISOString()
        };

        if (socket) {
            socket.emit('system_status', statusData);
        } else {
            this.io.emit('system_status', statusData);
        }
    }

    // 🔥 MÉTODO PARA EMITIR A TODOS LOS CLIENTES ADMIN
    emitToAdmin(event, data) {
        if (this.io) {
            this.io.to('admin_room').emit(event, {
                ...data,
                _wsTimestamp: new Date().toISOString()
            });
            console.log(`📢 [WS-ADMIN] Evento "${event}" emitido a ${this.adminRooms.size} admins`);
        }
    }

    // 🔥 MÉTODO PARA EMITIR A TODOS LOS CLIENTES
    emit(event, data) {
        if (this.io) {
            this.io.emit(event, {
                ...data,
                _wsTimestamp: new Date().toISOString()
            });
            console.log(`📢 [WS-ALL] Evento "${event}" emitido a ${this.connections.size} clientes`);
        }
    }

    // 🔥 MÉTODO PARA EMITIR A UN CLIENTE ESPECÍFICO
    emitToClient(socketId, event, data) {
        const socket = this.connections.get(socketId);
        if (socket) {
            socket.emit(event, {
                ...data,
                _wsTimestamp: new Date().toISOString()
            });
            console.log(`📢 [WS-CLIENT] Evento "${event}" emitido a cliente ${socketId}`);
        }
    }

    // 🔥 MÉTODOS ESPECÍFICOS PARA EVENTOS DEL SISTEMA

    // Cuando hay nueva compra
    emitNuevaCompra(compraData) {
        this.emitToAdmin('nueva_compra', {
            type: 'nueva_compra',
            compra: compraData,
            message: `🛒 Nueva compra de ${compraData.usuario}`
        });
    }

    // Cuando se actualiza una compra (sube comprobante, cambia estado, etc.)
    emitCompraActualizada(compraData) {
        this.emitToAdmin('compra_actualizada', {
            type: 'compra_actualizada',
            compra: compraData,
            message: `📝 Compra ${compraData.id} actualizada`
        });
    }

    // Cuando se recibe comprobante
    emitComprobanteRecibido(compraData) {
        this.emitToAdmin('comprobante_recibido', {
            type: 'comprobante_recibido',
            compra: compraData,
            message: `📸 ${compraData.usuario} envió comprobante`
        });
    }

    // Cuando se aprueba compra
    emitCompraAprobada(compraData) {
        this.emitToAdmin('compra_aceptada', {
            type: 'compra_aceptada',
            compra: compraData,
            message: `✅ Compra ${compraData.id} aprobada`
        });
    }

    // Cuando se rechaza compra
    emitCompraRechazada(compraData) {
        this.emitToAdmin('compra_rechazada', {
            type: 'compra_rechazada',
            compra: compraData,
            message: `❌ Compra ${compraData.id} rechazada`
        });
    }

    // Cuando se requiere intervención
    emitIntervencionRequerida(compraData, motivo) {
        this.emitToAdmin('intervencion_requerida', {
            type: 'intervencion_requerida',
            compra: compraData,
            motivo: motivo,
            message: `🚨 Intervención requerida: ${motivo}`
        });
    }

    // Estado de WhatsApp
    emitWhatsAppStatus(statusData) {
        this.emitToAdmin('whatsapp_status', {
            type: 'whatsapp_status',
            ...statusData
        });
    }

    // QR de WhatsApp
    emitWhatsAppQR(qrData) {
        this.emitToAdmin('whatsapp_qr', {
            type: 'whatsapp_qr',
            ...qrData
        });
    }

    // 🔥 MÉTODO PARA OBTENER ESTADÍSTICAS
    getStats() {
        return {
            connections: this.connections.size,
            adminConnections: this.adminRooms.size,
            active: true,
            rooms: Array.from(this.adminRooms)
        };
    }

    // 🔥 MÉTODO PARA DEBUG
    debugConnections() {
        console.log('🔍 [WS-DEBUG] Conexiones activas:');
        console.log(`   - Total: ${this.connections.size}`);
        console.log(`   - Admin: ${this.adminRooms.size}`);
        console.log(`   - IDs: ${Array.from(this.connections.keys()).join(', ')}`);
    }
}

export default WebSocketModule;
