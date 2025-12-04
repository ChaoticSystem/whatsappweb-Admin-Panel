// modules/compras.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ComprasModule {
    constructor() {
        this.dataPath = path.join(__dirname, '..');
    }

    async getAceptadas() {
        try {
            const compras = await this._leerCompras();
            return compras.filter(compra => compra.estado === 'aceptada');
        } catch (error) {
            console.error('❌ Error obteniendo compras aceptadas:', error);
            throw error;
        }
    }

    async getPendientes() {
        try {
            const compras = await this._leerCompras();
            return compras.filter(compra =>
                compra.estado === 'pendiente_pago' ||
                compra.estado === 'comprobante_recibido'
            );
        } catch (error) {
            console.error('❌ Error obteniendo compras pendientes:', error);
            throw error;
        }
    }

    async getRechazadas() {
        try {
            const compras = await this._leerCompras();
            return compras.filter(compra => compra.estado === 'rechazada');
        } catch (error) {
            console.error('❌ Error obteniendo compras rechazadas:', error);
            throw error;
        }
    }

    async _leerCompras() {
        try {
            const comprasDir = path.join(this.dataPath, 'compras_pendientes');
            if (!(await this._existeDirectorio(comprasDir))) return [];

            const archivos = await fs.readdir(comprasDir);
            const compras = [];

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    try {
                        const contenido = await fs.readFile(path.join(comprasDir, archivo), 'utf8');
                        const compra = JSON.parse(contenido);
                        compra.archivo = archivo;
                        compras.push(compra);
                    } catch (error) {
                        console.error(`❌ Error leyendo archivo ${archivo}:`, error);
                    }
                }
            }

            return compras.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        } catch (error) {
            console.error('❌ Error leyendo compras:', error);
            return [];
        }
    }

    async _existeDirectorio(ruta) {
        try {
            await fs.access(ruta);
            return true;
        } catch {
            return false;
        }
    }
}

export default ComprasModule;
