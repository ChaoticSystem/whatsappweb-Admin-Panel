// modules/comprobantes.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ComprobantesModule {
    constructor() {
        this.dataPath = path.join(__dirname, '..');
    }

    async getAll() {
        try {
            const compras = await this._leerComprasConComprobantes();
            return compras.filter(compra => compra.comprobante);
        } catch (error) {
            console.error('❌ Error obteniendo comprobantes:', error);
            throw error;
        }
    }

    async aceptar(id) {
        try {
            const comprasDir = path.join(this.dataPath, 'compras_pendientes');
            const archivos = await fs.readdir(comprasDir);

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    const compraPath = path.join(comprasDir, archivo);
                    const compra = JSON.parse(await fs.readFile(compraPath, 'utf8'));

                    if (compra.id === id) {
                        compra.estado = 'aceptada';
                        compra.fecha_aprobacion = new Date().toISOString();

                        await fs.writeFile(compraPath, JSON.stringify(compra, null, 2));
                        console.log(`✅ Comprobante ${id} aceptado`);
                        return { success: true, compra };
                    }
                }
            }

            throw new Error(`Comprobante con ID ${id} no encontrado`);
        } catch (error) {
            console.error('❌ Error aceptando comprobante:', error);
            throw error;
        }
    }

    async rechazar(id) {
        try {
            const comprasDir = path.join(this.dataPath, 'compras_pendientes');
            const archivos = await fs.readdir(comprasDir);

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    const compraPath = path.join(comprasDir, archivo);
                    const compra = JSON.parse(await fs.readFile(compraPath, 'utf8'));

                    if (compra.id === id) {
                        compra.estado = 'rechazada';
                        compra.fecha_rechazo = new Date().toISOString();

                        await fs.writeFile(compraPath, JSON.stringify(compra, null, 2));
                        console.log(`❌ Comprobante ${id} rechazado`);
                        return { success: true, compra };
                    }
                }
            }

            throw new Error(`Comprobante con ID ${id} no encontrado`);
        } catch (error) {
            console.error('❌ Error rechazando comprobante:', error);
            throw error;
        }
    }

    async _leerComprasConComprobantes() {
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
                        compras.push(compra);
                    } catch (error) {
                        console.error(`❌ Error leyendo archivo ${archivo}:`, error);
                    }
                }
            }

            return compras;
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

export default ComprobantesModule;
