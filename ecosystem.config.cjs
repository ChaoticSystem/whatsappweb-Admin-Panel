module.exports = {
  apps: [
    {
      name: 'sticker-rueda-gana',         // 🔹 Nombre del proceso (puedes cambiarlo)
      script: './app.js',                 // 🔹 Archivo principal de tu app
      node_args: '--max_old_space_size=256', // Opcional: límite de memoria
      instances: 1,                       // 1 = single instance (o "max" para clúster)
      autorestart: true,                  // Reinicia si se cae
      watch: false,                       // Puedes poner true si quieres que reinicie al cambiar archivos
      max_memory_restart: '500M',         // Reinicia si pasa de 500MB
      env: {
        NODE_ENV: 'production',
        PORT: 3000,                       // Si tu app usa puerto
        // Aquí puedes agregar variables de entorno personalizadas:
        API_KEY_PUBLIC: 'MI_API_PUBLICA',
        SHARED_SECRET: 'TU_SECRETO_COMPARTIDO',
        REMOTE_API_BASE: 'https://stickeruedaygana.com'
      },
      error_file: './logs/error.log',     // Archivo de errores
      out_file: './logs/out.log',         // Archivo de salida normal
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true                          // Muestra timestamp en logs
    }
  ]
};

