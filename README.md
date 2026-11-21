# Nexo Rosa · EIRA System

Fundación de una plataforma local-first de cuidado y coordinación comunitaria. Interfaz en español; **solo datos sintéticos**. Fase 1: la infraestructura funciona; los flujos clínicos, duplicados asistidos, cartas, importación e indicadores detallados pertenecen a fases posteriores.

## Inicio local

Requiere Node.js 20 LTS y npm. En esta máquina: `source ~/.nvm/nvm.sh && nvm use 20`.

```sh
npm ci
npm run build
npm start # http://localhost:3000
```

Desarrollo: `npm run dev`. Pruebas de la capa de sincronización: `npm test`.
Montserrat usa `next/font/google`; la primera compilación requiere acceso a Google Fonts. SQLite y los datos de demostración se crean automáticamente al cargar el servidor (Next también puede inicializarlos durante el build). No hay servicio externo de base de datos.

## Usuarios de demostración

Contraseña común: **eira2026**. El inicio permite email/contraseña o botones de acceso rápido.

| Correo | Rol interno | Perfil |
| --- | --- | --- |
| brigadista@eira.mx | captura | Brigadista |
| medico@eira.mx | consulta_clinica | Médico |
| laboratorio@eira.mx | laboratorio | Laboratorio |
| municipio@eira.mx | municipio | Enlace de Zapotlán el Grande |
| admin@eira.mx | admin | Administración |

## Arquitectura

- Next.js 14 App Router, TypeScript, Tailwind, lucide-react y Montserrat. Diseño de alto contraste, rosa mexicano, bordes de 1 px, sin sombras difusas. Campo adapta navegación y formularios a móvil.
- `lib/db.ts`: SQLite (`better-sqlite3`) en `data/nexo.db`, WAL y transacciones. Usuarios con bcrypt, pacientes, atenciones, jornadas, conflictos, historial por versión, operaciones aplicadas, archivos y bitácora. Los campos de dominio están en JSON; identificadores, versiones, autor y fecha son columnas; las atenciones tienen FK real a pacientes.
- `lib/auth.ts`: JWT HS256 de 12 horas (`jose`), cookie httpOnly SameSite=Lax. Una clave aleatoria persistida en SQLite firma las sesiones si no se configura `SESSION_SECRET`. `COOKIE_SECURE=true` para HTTPS. Middleware redirige sin cookie y el layout servidor valida firma y usuario; cada API verifica sesión y permisos independientemente.
- `lib/rbac.ts`: permisos centrales. Brigadista captura; médico autoriza PAP; laboratorio carga PDF; solo admin aprueba requisitos. Municipio recibe únicamente jornadas de su municipio y no puede cambiar municipio, cartas, estado general ni aprobaciones. No existe una API pública que edite usuarios o auditoría.
- `lib/local.ts`: Dexie aislado por usuario. Pacientes, atenciones, jornadas y outbox. `localWrite` hace una transacción local antes de cualquier red y agrupa ediciones pendientes de la misma entidad. Operaciones: `opId`, `table`, `entityId`, `type`, `patch`, `baseVersion`, `createdAt`.
- `POST /api/sync/push`: lotes de hasta 100, ordenados como se envían, atómicos; deduplicación por `opId`. El servidor asigna `EIRA-MX-001…`, devuelve remaps desde `EIRA-TMP-*` y remapea referencias de atenciones del mismo lote. Cliente remapea también referencias y operaciones todavía pendientes.
- Conflictos: compara cada campo del parche con el historial de `baseVersion` y la versión actual. Cambios disjuntos se combinan; cambios sobre el mismo campo crean un conflicto persistente y una entrada de bitácora, sin sobrescribir el servidor. Cliente marca `sync_status=conflict`; el parche original queda en `conflicts`. La resolución humana es fase posterior.
- `GET /api/sync/pull?since=<ISO>` devuelve registros cambiados y cursor. Consulta inclusiva para evitar pérdidas en el mismo milisegundo; la siguiente descarga es idempotente. No reemplaza registros locales pendientes o en conflicto.
- Barra global: conectividad real + simulada persistente, contador pendiente, sincronización manual y automática al volver online. Los fetch del cliente se bloquean cuando está offline; el service worker sirve caché sin red en modo simulado. Una solicitud ya iniciada antes del cambio puede terminar; no se inicia otra.
- PWA: manifiesto y service worker básico para recursos estáticos, página offline y shell visitado. Las APIs nunca se cachean. Los shells autenticados se eliminan en login/logout exitosos; no se cachean bitácora o conflictos. Abrir el espacio una vez online antes de usarlo sin conexión. IndexedDB conserva información por dispositivo; no compartir perfiles de navegador. No es un sistema de almacenamiento clínico cifrado.
- `audit_logs` es append-only incluso en SQLite mediante triggers. Cada operación aplicada y conflicto queda auditado. `POST /api/files` acepta un PDF de hasta 10 MB, solo laboratorio; archivos en `data/files`, metadatos en tabla. Descarga autenticada `GET /api/files/[id]`. Asociación clínica y entrega por token están pendientes; `/resultado/[token]` nunca revela datos.

## Datos y pantallas

Seed: 3 jornadas (Zapotlán el Grande / Ciudad Guzmán, Tuxpan, Gómez Farías), 10 pacientes, 18 atenciones en cinco categorías. Dos pares de nombres deliberadamente similares; nunca se fusionan automáticamente. `public/samples/` contiene dos CSV sintéticos de 20 filas, encabezados diferentes, personas repetidas, faltantes y fechas inválidas.

Rutas: `/login`, `/campo`, `/admin/pacientes`, `/admin/conflictos`, `/admin/bitacora`, `/admin/jornadas`, `/admin/pap`, `/admin/impacto` y `/resultado/[token]`. Captura de paciente local funcional para comprobar infraestructura; listados desde Dexie. Las pantallas especializadas son bases de próximas fases, no prometen flujos implementados.

## API: ejemplo mínimo

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"brigadista@eira.mx","password":"eira2026"}' http://localhost:3000/api/auth/login
curl -b cookies.txt -H 'Content-Type: application/json' -d '{"ops":[{"opId":"demo-1","table":"patients","entityId":"EIRA-TMP-demo","type":"create","patch":{"nombre_completo":"Mujer Sintética","fecha_nacimiento":"1985-01-01","municipio":"Tuxpan"},"baseVersion":0,"createdAt":"2026-01-01T00:00:00Z"}]}' http://localhost:3000/api/sync/push
curl -b cookies.txt 'http://localhost:3000/api/sync/pull?since=2026-01-01T00:00:00Z'
```

Para probar conflicto, actualiza el mismo campo dos veces con `baseVersion:1`, usando `opId` distintos: la segunda operación devuelve `status:conflict`. Un brigadista recibe 403 en `POST /api/admin/requirements` incluso con cuerpo vacío.

## Docker

```sh
docker build -t nexo-rosa .
docker run --rm -p 3000:3000 -v nexo-data:/app/data nexo-rosa
```

El volumen conserva SQLite, clave de firma y PDFs. Ejecuta como usuario no root. `DATA_DIR` puede cambiar la ruta local. Respalda DB/WAL con herramientas SQLite, no copies una DB activa sin snapshot consistente. No borres `data/` salvo para reiniciar deliberadamente la demo.

## Límites de esta fase / seguridad

No usar con datos reales. Faltan rotación de sesiones, recuperación de contraseña, rate limiting, cifrado de dispositivo, escaneo antivirus y resolución de conflictos. El portal PAP no emite tokens ni notificaciones. La versión Next 14 fue exigida por el alcance; `npm audit` reporta vulnerabilidades del framework sin parche en la serie 14 (actualizar a una versión mantenida requiere cambiar esa decisión). No exponer la demo a internet ni considerarla lista para producción.
