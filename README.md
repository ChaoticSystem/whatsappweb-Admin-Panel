# WhatsApp Web Admin Panel

Un panel administrativo avanzado para gestionar **instancias de WhatsApp Web** mediante automatización con Node.js.  
Permite controlar sesiones, leer códigos QR, manejar mensajes y administrar múltiples dispositivos mediante una interfaz web profesional.

---

## 🚀 Características

- 🔐 **Autenticación segura**
- 📡 **Gestión de sesiones WhatsApp Web**
- 📲 Visualización de **QR en tiempo real**
- 🔄 Reconexión automática
- 📨 Lectura y envío de mensajes
- 🕹 Panel administrativo completo
- 🌐 Interfaz responsiva y moderna
- 🛠 API REST para automatizaciones externas

---

## 📦 Tecnologías utilizadas

- Node.js
- Express.js
- WebSocket / Socket.IO
- Puppeteer / Playwright
- WhatsApp Web reverse-engineering
- TailwindCSS / Bootstrap (dependiendo del build)
- PM2 (para producción)

---

## 📁 Estructura del proyecto

```plaintext
whatsappweb-Admin-Panel/
│── src/
│   ├── controllers/
│   ├── services/
│   ├── routes/
│   ├── utils/
│   ├── public/
│   └── views/
│
│── config/
│── logs/
│── .gitignore
│── package.json
│── README.md
│── LICENSE