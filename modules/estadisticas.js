// modules/estadisticas.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EstadisticasModule {
    constructor() {
        this.dataPath = path.join(__dirname, '..');
    }

    async getEstadisticasGenerales() {
        try {
            // Leer usuarios
            const usuarios = await this._leerUsuarios();

            // Leer compras
            const compras = await this._leerCompras();

            // Leer comprobantes
            const comprobantes = await this._leerComprobantes();

            // Calcular estadísticas
            const comprasAceptadas = compras.filter(c => c.estado === 'aceptada');
            const comprasPendientes = compras.filter(c =>
                c.estado === 'pendiente_pago' ||
                c.estado === 'comprobante_recibido'  // ← AGREGAR ESTA LÍNEA
            );
            const comprasRechazadas = compras.filter(c => c.estado === 'rechazada');

            const totalIngresos = comprasAceptadas.reduce((sum, compra) => {
                return sum + (parseFloat(compra.valorTotal) || 0);
            }, 0);

            return {
                totalUsuarios: usuarios.length,
                totalCompras: compras.length,
                comprasAceptadas: comprasAceptadas.length,
                comprasPendientes: comprasPendientes.length,
                comprasRechazadas: comprasRechazadas.length,
                totalIngresos: totalIngresos,
                comprobantesPendientes: comprobantes.filter(c => c.estado === 'pendiente').length,
                fechaActual: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw error;
        }
    }

    async _leerUsuarios() {
        try {
            const usuariosDir = path.join(this.dataPath, 'usuarios');
            if (!(await this._existeDirectorio(usuariosDir))) return [];

            const archivos = await fs.readdir(usuariosDir);
            const usuarios = [];

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    const contenido = await fs.readFile(path.join(usuariosDir, archivo), 'utf8');
                    const usuario = JSON.parse(contenido);
                    usuarios.push(usuario);
                }
            }

            return usuarios;
        } catch (error) {
            console.error('❌ Error leyendo usuarios:', error);
            return [];
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
                    const contenido = await fs.readFile(path.join(comprasDir, archivo), 'utf8');
                    const compra = JSON.parse(contenido);
                    compras.push(compra);
                }
            }

            return compras;
        } catch (error) {
            console.error('❌ Error leyendo compras:', error);
            return [];
        }
    }

    async _leerComprobantes() {
        try {
            const comprobantesDir = path.join(this.dataPath, 'comprobantes');
            if (!(await this._existeDirectorio(comprobantesDir))) return [];

            const archivos = await fs.readdir(comprobantesDir);
            const comprobantes = [];

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    const contenido = await fs.readFile(path.join(comprobantesDir, archivo), 'utf8');
                    const comprobante = JSON.parse(contenido);
                    comprobantes.push(comprobante);
                }
            }

            return comprobantes;
        } catch (error) {
            console.error('❌ Error leyendo comprobantes:', error);
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

export default EstadisticasModule;
