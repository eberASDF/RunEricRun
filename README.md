# RunEricRun

Juego de saltos para teléfono con Expo Go y control desde un smartwatch React. Usa Supabase para vincular los dispositivos, seleccionar personajes y guardar puntuaciones. Los saltos se envían por Realtime, sin VPS.

## Preparación

Requiere Node.js 22.13+ o 24.3+, Internet y Expo Go compatible con SDK 58.
En cada aplicación, copia `.env.example` a `.env` y configura la URL y la clave publicable del mismo proyecto Supabase. El proyecto actual ya tiene configurada la base de datos.

## Ejecutar

Desde la carpeta del proyecto, abre dos terminales.

Teléfono:

```powershell
cd mobile
npm ci
npm start -- --clear
```

Escanea el QR con Expo Go. El teléfono debe poder acceder a la computadora por la red local.

Smartwatch:

```powershell
cd react-smartwatch-emulator-master
npm ci
npm start
```

Abre [localhost:5173](http://localhost:5173). Genera un código con **Vincular reloj** en el teléfono e introdúcelo en el reloj. Inicia la partida en el teléfono y usa **Saltar** en el reloj.

## Comprobar

```powershell
cd mobile
npm run typecheck
npm run test:game
cd ../react-smartwatch-emulator-master
npm run build
```

El adaptador del VPS se conserva en `src/components/RunEricRun/transport.js` del reloj para una integración futura.
