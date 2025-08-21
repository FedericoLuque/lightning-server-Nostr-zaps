# Servidor de Lightning Address y Nostr Zaps

Este proyecto es una solución de código abierto para que puedas alojar tu propio servidor de **Lightning Address** (`[tunombre]@[tu-web.com]`). Permite recibir pagos de Bitcoin a través de la Lightning Network de forma sencilla y se integra perfectamente con el protocolo Nostr para recibir **Zaps** (NIP-57).

### Características Principales

  * **Auto-hospedado:** Mantén el control total de tu infraestructura de pagos y tus claves.
  * **Soporte para LNURL-pay:** Permite recibir pagos de cualquier monedero Lightning compatible.
  * **Integración completa con Nostr:** Genera y firma recibos de zaps (evento 9735) que se publican automáticamente en los relays de Nostr.
  * **Backend flexible:** Utiliza LNbits como backend para la gestión de facturas.
  * **Tecnologías:** Construido con **Node.js**, **Express.js**, y `nostr-tools`.

### Prerrequisitos

Para usar este servidor, necesitas:

  * Un **VPS (Servidor Virtual Privado)** con acceso SSH.
  * Un dominio o subdominio, como `[tu-web.com]`, con la capacidad de alojar archivos estáticos en la ruta `/.well-known/`.
  * Acceso a un **nodo LNbits** y la `Invoice/Read Key` de tu monedero.
  * **Node.js** y **npm** instalados en tu VPS.

### Guía de Instalación y Configuración

Sigue estos pasos para poner tu servidor en funcionamiento.

#### 1\. Obtén tus claves y variables

  * **Claves de Nostr:** Genera un par de claves de Nostr nuevas (una pública y una privada). La clave privada (`nsec`) debe ser decodificada a formato hexadecimal para usarla en el servidor.
  * **Clave de LNbits:** Asegúrate de tener tu `Invoice/Read Key` de LNbits.

#### 2\. Configura tu entorno

Crea un directorio para tu proyecto en el VPS y entra en él:

```bash
mkdir lightning-server
cd lightning-server
```

Crea un archivo `.env` para almacenar tus variables de entorno sensibles:

```bash
nano .env
```

Pega el siguiente contenido, reemplazando los valores por los tuyos:

```bash
LNBITS_API_URL=https://<tu-url-lnbits.com>
LNBITS_INVOICE_KEY=<tu-invoice-key>
SERVER_PRIVATE_KEY=<tu-clave-privada-en-formato-hex>
# Si usas Tor:
TOR_PROXY_URL=socks5://127.0.0.1:9050
```

#### 3\. El Código del Servidor

Crea el archivo principal del servidor, `lightning-server.js`:

```bash
nano lightning-server.js
```

Pega el código del servidor en el archivo y guárdalo.

#### 4\. Configura el archivo NIP-05

Para que tu dirección sea compatible con Nostr, debes crear un archivo `nostr.json` y subirlo a la ruta `/.well-known/` de tu servidor web. El contenido debe ser el siguiente, reemplazando los valores con los tuyos:

```json
{
  "names": {
    "[tunombre]": "tu-clave-publica-hex-de-nostr"
  },
  "relays": {
    "tu-clave-publica-hex-de-nostr": [
      "wss://relay.damus.io",
      "wss://nos.lol"
    ]
  }
}
```

#### 5\. Instala las dependencias y ejecuta el servidor

Ejecuta el siguiente comando para instalar todas las librerías necesarias. Esto creará los archivos `package.json` y `node_modules`.

```bash
npm install express axios cors nostr-tools ws socks-proxy-agent dotenv
```

Para mantener el servidor funcionando en segundo plano, incluso si cierras tu sesión SSH, usa **PM2**:

```bash
npm install pm2 -g
pm2 start lightning-server.js --name "[tunombre]-server"
pm2 save
```

### Uso

Una vez que tu servidor esté en línea, puedes configurar tu dirección en tu perfil de Nostr. En tu cliente favorito (Amethyst, Damus, Primal, etc.), ve a la configuración de tu perfil y añade tu Lightning Address en el campo de `NIP-05`:

`[tunombre]@[tu-web.com]`

¡Ya estás listo para recibir pagos y Zaps\! ⚡️

### Contribución

Las contribuciones son bienvenidas. Siéntete libre de abrir un *issue* o enviar un *pull request* con mejoras o correcciones.

### Licencia

Este proyecto está bajo la licencia MIT.
