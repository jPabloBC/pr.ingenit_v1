// Configuración de la URL base del backend para desarrollo y producción
// Cambia la IP por la de tu máquina en la red local si es necesario

// Para pruebas en emulador Android usar 10.0.2.2 y puerto 4000 (servidor dev local)
// Para pruebas en LAN (dispositivo físico) usa la IP de tu máquina: http://192.168.x.y:3000
const LOCAL_API_URL = process.env.EXPO_LOCAL_API_URL || 'http://192.168.1.92:4000'; // Emulador Android por defecto
const PROD_API_URL = 'https://api.tuapp.com'; // Cambia por tu dominio real en producción

export const API_BASE_URL =
  process.env.NODE_ENV === 'development' ? LOCAL_API_URL : PROD_API_URL;
