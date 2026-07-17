# WhatsApp Bridge

Servicio central para envios puntuales desde un unico WhatsApp enlazado. No se ejecuta en Vercel.

## Variables requeridas

```bash
WHATSAPP_BRIDGE_TOKEN=un-secreto-largo-y-aleatorio
WHATSAPP_ALLOWED_MEDIA_ORIGIN=https://pr.ingenit.cl
WHATSAPP_AUTH_PATH=/app/.wwebjs_auth
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## Produccion

Desplegar este directorio como contenedor en un host con volumen persistente montado en `/app/.wwebjs_auth`. La primera vez se debe revisar el log del contenedor y escanear el QR con el telefono emisor. Despues, todos los usuarios autorizados de la plataforma podran solicitar envios desde cualquier computador.

En Vercel configurar tambien:

```bash
WHATSAPP_BRIDGE_URL=https://whatsapp-bridge.example.com
WHATSAPP_BRIDGE_TOKEN=el-mismo-secreto
```

El servicio limita cada solicitud a 30 destinatarios por defecto y solo acepta PDF descargados desde `WHATSAPP_ALLOWED_MEDIA_ORIGIN`.
