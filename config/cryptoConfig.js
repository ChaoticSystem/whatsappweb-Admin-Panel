// config/cryptoConfig.js
export const CRYPTO_CONFIG = {
    // Configuración de claves
    KEY_PATHS: {
        NODE: {
            PRIVATE: './claves_node/clave_privada.pem',
            PUBLIC: './claves_node/clave_publica.pem'
        },
        PHP: {
            PRIVATE: './claves_php/clave_privada.pem', 
            PUBLIC: './claves_php/clave_publica.pem'
        }
    },
    
    // Configuración de algoritmos
    ALGORITHMS: {
        RSA: {
            PADDING: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            OAEP_HASH: 'sha256'
        },
        AES: {
            ALGORITHM: 'aes-256-gcm',
            KEY_SIZE: 32, // 256 bits
            IV_SIZE: 16   // 128 bits
        }
    },
    
    // Configuración API
    API: {
        BASE_URL: "https://stickeruedaygana.com",
        ENDPOINTS: {
            VERIFY_USER: "/api/getUserData.php",
            PROCESS_COMPROBANTE: "/api/processComprobante.php", 
            APPROVE_PURCHASE: "/api/approvePurchase.php"
        },
        HEADERS: {
            'Content-Type': 'application/json',
            'X-API-Version': '1.0'
        }
    }
};
