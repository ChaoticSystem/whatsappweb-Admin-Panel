// modules/usuarios.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UsuariosModule {
    constructor() {
        this.dataPath = path.join(__dirname, '..');
    }

    async getAll() {
        try {
            const usuariosDir = path.join(this.dataPath, 'usuarios');
            if (!(await this._existeDirectorio(usuariosDir))) return [];

            const archivos = await fs.readdir(usuariosDir);
            const usuarios = [];

            for (const archivo of archivos) {
                if (archivo.endsWith('.json')) {
                    try {
                        const contenido = await fs.readFile(path.join(usuariosDir, archivo), 'utf8');
                        const usuario = JSON.parse(contenido);
                        usuario.archivo = archivo.replace('.json', '');
                        usuarios.push(usuario);
                    } catch (error) {
                        console.error(`❌ Error leyendo archivo ${archivo}:`, error);
                    }
                }
            }

            return usuarios.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro));
        } catch (error) {
            console.error('❌ Error obteniendo usuarios:', error);
            throw error;
        }
    }

    async bloquear(id) {
        try {
            const usuarioPath = path.join(this.dataPath, 'usuarios', `${id}.json`);

            if (await this._existeArchivo(usuarioPath)) {
                const usuario = JSON.parse(await fs.readFile(usuarioPath, 'utf8'));
                usuario.estado = 'bloqueado';
                usuario.fecha_bloqueo = new Date().toISOString();

                await fs.writeFile(usuarioPath, JSON.stringify(usuario, null, 2));
                console.log(`🔒 Usuario ${id} bloqueado`);
                return { success: true, usuario };
            }

            throw new Error(`Usuario con ID ${id} no encontrado`);
        } catch (error) {
            console.error('❌ Error bloqueando usuario:', error);
            throw error;
        }
    }

    async activar(id) {
        try {
            const usuarioPath = path.join(this.dataPath, 'usuarios', `${id}.json`);

            if (await this._existeArchivo(usuarioPath)) {
                const usuario = JSON.parse(await fs.readFile(usuarioPath, 'utf8'));
                usuario.estado = 'activo';
                usuario.fecha_activacion = new Date().toISOString();

                await fs.writeFile(usuarioPath, JSON.stringify(usuario, null, 2));
                console.log(`🔓 Usuario ${id} activado`);
                return { success: true, usuario };
            }

            throw new Error(`Usuario con ID ${id} no encontrado`);
        } catch (error) {
            console.error('❌ Error activando usuario:', error);
            throw error;
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

    async _existeArchivo(ruta) {
        try {
            await fs.access(ruta);
            return true;
        } catch {
            return false;
        }
    }
}

export default UsuariosModule;
