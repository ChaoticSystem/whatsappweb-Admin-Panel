# 🟢 WhatsApp Web Admin Panel

Un **panel administrativo avanzado** para gestionar **instancias de WhatsApp Web** mediante automatización con Node.js.  
Este sistema permite administrar múltiples sesiones de WhatsApp, leer códigos QR, enviar/recibir mensajes, manejar usuarios y ofrecer un panel visual completo para operadores o administradores.

---

## 🚀 Características principales

- 🔐 **Autenticación segura con tokens**
- 📡 **Gestión de múltiples sesiones WhatsApp Web**
- 📲 Visualización de **QR en tiempo real**
- 🔄 Reconexión automática ante fallos
- 📥 Recepción y envío de mensajes
- 🕹 Panel administrativo profesional
- 🌐 Interfaz web responsiva
- ⚙ API REST para integraciones externas
- 📊 Estadísticas del sistema y uso
- 🔔 Notificaciones en tiempo real vía WebSocket
- 🛡 Middlewares de seguridad y rate-limit

---

## 📦 Tecnologías utilizadas

### **Backend**
- Node.js
- Express.js
- Socket.IO
- WhatsApp Web reverse-engineering
- Puppeteer / Playwright
- JSON Web Tokens (JWT)
- Criptografía RSA / AES

### **Frontend**
- HTML5 / CSS3
- TailwindCSS o Bootstrap
- JavaScript (ES6)

### **DevOps**
- PM2 para producción
- Nginx (opcional)
- Logs rotativos

---

## 📁 Estructura del proyecto

```plaintext
Bot-ElChanchoGanador/
│── app.js
│── index.js
│── package.json
│── ecosystem.config.cjs
│
├── config/
│   ├── config.json
│   ├── cryptoConfig.js
│   ├── whatsapp-config.js
│
├── modules/
│   ├── compras.js
│   ├── comprobantes.js
│   ├── cryptoModule.js
│   ├── estadisticas.js
│   ├── notificaciones.js
│   ├── usuarios.js
│   ├── utils.js
│   ├── websocket.js
│   ├── whatsapp.js
│
├── middlewares/
│   ├── auth.js
│   ├── securityMiddleware.js
│   ├── messageHandler.js
│   ├── rateLimitMiddleware.js
│   └── index.js
│
├── routes/
│   ├── admin.js
│   ├── auth.js
│   └── index.js
│
├── public/
│   └── admin/
│       ├── index.html
│       └── login.html
│
├── utils/
│   └── cryptoUtils.js
│
└── claves_node/
    ├── clave_privada.pem
    └── clave_publica.pem

    
## Instalación rápida

1. Clonar:
   git clone https://github.com/ChaoticSystem/whatsappweb-Admin-Panel.git
   cd whatsappweb-Admin-Panel

2. Instalar dependencias:
   npm install

3. Crear archivo de entorno:
   cp .env.example .env
   editar `.env` y rellenar valores (JWT_SECRET, rutas de claves, etc.)

4. **No** subas claves ni `.env` al repositorio.

5. Ejecutar en desarrollo:
   node index.js

6. En producción (PM2):
   pm2 start ecosystem.config.cjs
