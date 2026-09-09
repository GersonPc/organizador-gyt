# Organizador GyT

Aplicación de navegador para ordenar fotografías de certificadoras y descargar un ZIP por agencia. Las fotos y el PDF se procesan localmente; no se envían a un servidor ni se guardan en una base de datos. Las imágenes conservan sus bytes originales.

## Desarrollo para Cloudflare

Requiere Node.js 22.13 o posterior y npm.

```sh
git clone https://github.com/GersonPc/organizador-gyt.git
cd organizador-gyt
npm ci
npm run dev:cloudflare
```

La interfaz compartida está en `app/page.tsx`, las reglas de nombres y lectura de datos en `app/organizer.ts`, y los estilos en `app/globals.css`.

## Publicar en Cloudflare Workers Static Assets

```sh
npx wrangler login
npm run deploy:cloudflare
```

Solo se publica `dist-cloudflare`, generado con Vite. No se necesitan secretos de aplicación, servidor, D1 ni R2. `wrangler.jsonc` contiene el identificador de la cuenta de destino (no es una contraseña ni un token). No subas credenciales, boletas ni fotos al repositorio.

## Conexión GitHub → Cloudflare

Para activar publicaciones automáticas, conectar este repositorio desde la configuración de Builds del Worker `organizador-gyt`:

- Rama de producción: `main`.
- Directorio raíz: raíz del repositorio.
- Comando de compilación: `npm run build:cloudflare`.
- Comando de despliegue: `npx wrangler deploy --config wrangler.jsonc`.
- Node.js: 22.13 o posterior.

Una vez activada esa conexión, un `git push origin main` inicia la publicación. Editar archivos en una computadora, o descargarlos como ZIP, no actualiza por sí solo el sitio. Antes de trabajar desde otra computadora, ejecutar `git pull --ff-only`.

Los comandos originales `dev`, `build` y `start`, y la configuración de Sites se conservan para compatibilidad con el alojamiento anterior; no son los comandos de compilación de Cloudflare.
