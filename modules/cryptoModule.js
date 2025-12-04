// cryptoModule.js
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CryptoModule {
    constructor() {
        // Cargar claves desde archivos
        this.privateKey = this.loadPrivateKey();
        this.publicKey = this.loadPublicKey();
    }

    /**
     * 🔐 CARGAR LLAVE PRIVADA DE NODE.JS
     */
    loadPrivateKey() {
        try {
            const keyPath = path.join(__dirname, '../claves_node/clave_privada.pem');
            if (!fs.existsSync(keyPath)) {
                throw new Error('❌ No se encontró la clave privada de Node.js');
            }
            return fs.readFileSync(keyPath, 'utf8');
        } catch (error) {
            console.error('❌ Error cargando clave privada:', error);
            throw error;
        }
    }

    /**
     * 🔑 CARGAR LLAVE PÚBLICA DEL PHP
     */
    loadPublicKey() {
        try {
            const keyPath = path.join(__dirname, '../claves_node/clave_publica.pem');
            if (!fs.existsSync(keyPath)) {
                throw new Error('❌ No se encontró la clave pública del PHP');
            }
            return fs.readFileSync(keyPath, 'utf8');
        } catch (error) {
            console.error('❌ Error cargando clave pública:', error);
            throw error;
        }
    }

    /**
     * 🔒 CIFRAR DATOS PARA PHP (usa la clave pública del PHP)
     */
    encryptForPHP(data) {
        try {
            // Si los datos son un objeto, convertirlos a JSON
            const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
            
            // Cifrar usando la clave pública del PHP
            const encryptedBuffer = crypto.publicEncrypt(
                {
                    key: this.publicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                Buffer.from(dataString, 'utf8')
            );

            // Devolver en base64 para fácil transmisión
            return encryptedBuffer.toString('base64');
        } catch (error) {
            console.error('❌ Error cifrando datos para PHP:', error);
            throw new Error('Error en cifrado: ' + error.message);
        }
    }

    /**
     * 🔓 DESCIFRAR DATOS DEL PHP (usa la clave privada de Node.js)
     */
    decryptFromPHP(encryptedData) {
        try {
            // Convertir de base64 a Buffer
            const encryptedBuffer = Buffer.from(encryptedData, 'base64');
            
            // Descifrar usando nuestra clave privada
            const decryptedBuffer = crypto.privateDecrypt(
                {
                    key: this.privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                encryptedBuffer
            );

            const decryptedString = decryptedBuffer.toString('utf8');
            
            // Intentar parsear como JSON, si falla devolver string
            try {
                return JSON.parse(decryptedString);
            } catch {
                return decryptedString;
            }
        } catch (error) {
            console.error('❌ Error descifrando datos del PHP:', error);
            throw new Error('Error en descifrado: ' + error.message);
        }
    }

    /**
     * 🔍 VERIFICAR INTEGRIDAD DE FIRMA (si PHP firma los datos)
     */
    verifySignature(data, signature) {
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(typeof data === 'object' ? JSON.stringify(data) : String(data));
            verify.end();
            
            return verify.verify(this.publicKey, signature, 'base64');
        } catch (error) {
            console.error('❌ Error verificando firma:', error);
            return false;
        }
    }

    /**
     * ✍️ FIRMAR DATOS (para cuando Node.js necesita firmar)
     */
    signData(data) {
        try {
            const sign = crypto.createSign('SHA256');
            sign.update(typeof data === 'object' ? JSON.stringify(data) : String(data));
            sign.end();
            
            return sign.sign(this.privateKey, 'base64');
        } catch (error) {
            console.error('❌ Error firmando datos:', error);
            throw error;
        }
    }

    /**
     * 🔄 GENERAR CLAVES AES PARA CIFRADO SIMÉTRICO (opcional)
     */
    generateAESKey() {
        return crypto.randomBytes(32); // 256 bits
    }

    /**
     * 🔒 CIFRAR CON AES (para datos grandes)
     */
    encryptAES(data, key) {
        try {
            // Ensure key is a 32-byte Buffer. If user passed a password string, derive with SHA-256.
            if (typeof key === 'string') {
                key = crypto.createHash('sha256').update(key).digest();
            }
            if (!Buffer.isBuffer(key) || key.length !== 32) {
                throw new Error('AES key must be 32 bytes');
            }

            const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const encryptedBuf = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
            const authTag = cipher.getAuthTag();

            return {
                encrypted: encryptedBuf.toString('base64'),
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64')
            };
        } catch (error) {
            console.error('❌ Error en cifrado AES:', error);
            throw error;
        }
    }

    /**
     * 🔓 DESCIFRAR CON AES
     */
    decryptAES(encryptedData, key, iv, authTag) {
        try {
            if (typeof key === 'string') {
                key = crypto.createHash('sha256').update(key).digest();
            }
            if (!Buffer.isBuffer(key) || key.length !== 32) {
                throw new Error('AES key must be 32 bytes');
            }

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
            decipher.setAuthTag(Buffer.from(authTag, 'base64'));

            const decryptedBuf = Buffer.concat([
                decipher.update(Buffer.from(encryptedData, 'base64')),
                decipher.final()
            ]);

            return decryptedBuf.toString('utf8');
        } catch (error) {
            console.error('❌ Error en descifrado AES:', error);
            throw error;
        }
    }
}

export default CryptoModule;
