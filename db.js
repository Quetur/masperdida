import mysql from 'mysql2/promise';
import 'dotenv/config';

// 1. Validación de variables de entorno (Indispensable para entornos Multiplataforma)
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
requiredEnv.forEach(name => {
  if (!process.env[name]) {
    throw new Error(`[Error de Configuración]: Falta la variable ${name} en el archivo .env`);
  }
});

/**
 * CONFIGURACIÓN DE ALTO RENDIMIENTO PARA LÍMITES ESTRICTOS (Max 5)
 */
const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // --- ESTRATEGIA DE SUPERVIVENCIA (5 Conexiones) ---
  
  // Dejamos el límite en 4 para evitar tocar el techo de 5 y permitir 
  // que herramientas de administración (como phpMyAdmin) sigan funcionando.
  connectionLimit: 4, 

  // Si las 4 están ocupadas, el siguiente usuario espera 10s en cola 
  // antes de lanzar un error, dándole tiempo a una conexión a liberarse.
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000, 

  // Cerramos conexiones inactivas casi de inmediato para liberar el slot.
  maxIdle: 0,               // No mantiene ninguna conexión "durmiendo"
  idleTimeout: 2000,        // 2 segundos de gracia antes de cerrar
  enableKeepAlive: false,   // Evita que la conexión se mantenga abierta "por si acaso"
  
  // Optimización de red
  yieldEventLoop: true,     // Ayuda a Node.js a no bloquearse en operaciones pesadas
};



const pool = mysql.createPool(poolConfig);

// 2. TEST DE CONEXIÓN INICIAL
// Esto detecta si el límite de 5 ya está excedido antes de que lances la App.
pool.getConnection()
  .then(conn => {
    console.log('✅ Base de Datos conectada (Pool optimizado para 4 slots)');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error crítico de conexión:', err.message);
    if (err.code === 'ER_CON_COUNT_ERROR' || err.message.includes('max_user_connections')) {
      console.error('⚠️ ALERTA: Has superado el límite de 5 conexiones de tu hosting.');
    }
  }); 

/**
 * RECOMENDACIÓN DE EXPERTO:
 * Usa siempre `pool.query()` para consultas rápidas. 
 * Solo usa `pool.getConnection()` si vas a manejar TRANSACCIONES, 
 * y asegúrate de usar un bloque try/finally para hacer .release()
 */

export default pool;