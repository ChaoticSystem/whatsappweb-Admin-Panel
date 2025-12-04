import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CryptoUtils {
    constructor() {
        try {
            // Cargar claves desde la carpeta claves_node
            this.publicKeyPHP = fs.readFileSync(
                path.join(__dirname, '../claves_node/clave_publica.pem'), 
                'utf8'
            );
            this.privateKeyNode = fs.readFileSync(
                path.join(__dirname, '../claves_node/clave_privada.pem'), 
                'utf8'
            );
            console.log('✅ Claves cargadas correctamente');
        } catch (error) {
            console.error('❌ Error cargando claves:', error.message);
            throw error;
        }
    }

    // 🔐 CIFRAR datos para enviar a PHP
    encryptForPHP(data) {
        try {
            console.log('🔐 Cifrando datos para PHP...');
            const buffer = Buffer.from(JSON.stringify(data));
            const encrypted = crypto.publicEncrypt(
                {
                    key: this.publicKeyPHP,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                buffer
            );
            console.log('✅ Datos cifrados correctamente');
            return encrypted.toString('base64');
        } catch (error) {
            console.error('❌ Error cifrando datos para PHP:', error);
            throw error;
        }
    }

    // 🔓 DESCIFRAR datos recibidos de PHP
    decryptFromPHP(encryptedData) {
        try {
            console.log('🔓 Descifrando datos de PHP...');
            const buffer = Buffer.from(encryptedData, 'base64');
            const decrypted = crypto.privateDecrypt(
                {
                    key: this.privateKeyNode,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: 'sha256'
                },
                buffer
            );
            const result = JSON.parse(decrypted.toString());
            console.log('✅ Datos descifrados correctamente');
            return result;
        } catch (error) {
            console.error('❌ Error descifrando datos de PHP:', error);
            throw error;
        }
    }
}

export default new CryptoUtils();
