import mysql from 'mysql2/promise';
import 'dotenv/config';

// 1. Validación de variables de entorno para evitar fallos silenciosos
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
requiredEnv.forEach(name => {
  if (!process.env[name]) {
    throw new Error(`[Error de Configuración]: Falta la variable ${name} en el archivo .env`);
  }
});

// 2. Configuración del Pool con política de "limpieza agresiva"
const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  
  // OPTIMIZACIÓN DE SESIONES:
  waitForConnections: true,
  connectionLimit: 5,      // Máximo de conexiones simultáneas
  maxIdle: 0,               // Cierra inmediatamente las conexiones que no se usen
  idleTimeout: 5000,        // Tiempo de espera (5s) antes de marcar como inactiva
  enableKeepAlive: false,   // Desactivado para favorecer el cierre de sesión
};

const pool = mysql.createPool(poolConfig);

/**
 * Nota: Al usar mysql2/promise, no necesitas cerrar la conexión 
 * manualmente tras cada query si usas pool.query(). 
 * El pool lo hace por ti basándose en 'maxIdle'.
 */

export default pool;
