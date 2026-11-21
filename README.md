# Nexo Rosa · EIRA System

Plataforma local-first de cuidado y coordinación comunitaria. Interfaz en español; **solo datos sintéticos**. Fases 1–2: infraestructura, captura de campo, identidad asistida, formularios clínicos, expedientes, conflictos y bitácora. Cartas, importación e indicadores detallados pertenecen a fases posteriores.

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
- `lib/local.ts`: Dexie aislado por usuario. Pacientes, atenciones, jornadas, decisiones y outbox. `localWrite` hace una transacción local antes de cualquier red y agrupa ediciones pendientes de la misma entidad, conservando las respuestas clínicas no modificadas. Operaciones: `opId`, `table`, `entityId`, `type`, `patch`, `baseVersion`, `createdAt`.
- `POST /api/sync/push`: lotes de hasta 100, ordenados como se envían, atómicos; deduplicación por `opId`. El servidor asigna `EIRA-MX-001…`, devuelve remaps desde `EIRA-TMP-*` y remapea referencias de atenciones del mismo lote. Cliente remapea también referencias y operaciones todavía pendientes.
- Conflictos: compara cada campo del parche con el historial de `baseVersion` y la versión actual, incluidas respuestas individuales de `form_data`. Cambios disjuntos se combinan; cambios sobre el mismo campo crean un conflicto persistente y una entrada de bitácora, sin sobrescribir el servidor. Cliente marca `sync_status=conflict`; el parche original queda en `conflicts`. Administración elige por campo y envía una decisión inmutable, con control de versión y auditoría.
- `GET /api/sync/pull?since=<ISO>` devuelve registros cambiados y cursor. Consulta inclusiva para evitar pérdidas en el mismo milisegundo; la siguiente descarga es idempotente. No reemplaza registros locales pendientes o en conflicto.
- Barra global: conectividad real + simulada persistente, contador pendiente, sincronización manual y automática al volver online. Los fetch del cliente se bloquean cuando está offline; el service worker sirve caché sin red en modo simulado. Una solicitud ya iniciada antes del cambio puede terminar; no se inicia otra.
- PWA: manifiesto y service worker básico para recursos estáticos, página offline y shell visitado. Las APIs nunca se cachean. Los shells autenticados se eliminan en login/logout exitosos; no se cachean bitácora o conflictos. Abrir el espacio una vez online antes de usarlo sin conexión. IndexedDB conserva información por dispositivo; no compartir perfiles de navegador. No es un sistema de almacenamiento clínico cifrado.
- `audit_logs` es append-only incluso en SQLite mediante triggers. Cada operación aplicada y conflicto queda auditado. `POST /api/files` acepta un PDF de hasta 10 MB, solo laboratorio; archivos en `data/files`, metadatos en tabla. Descarga autenticada `GET /api/files/[id]`. Asociación clínica y entrega por token están pendientes; `/resultado/[token]` nunca revela datos.

## Datos y pantallas

Seed: 3 jornadas (Zapotlán el Grande / Ciudad Guzmán, Tuxpan, Gómez Farías), 10 pacientes, 18 atenciones en cinco categorías. Dos pares de nombres deliberadamente similares; nunca se fusionan automáticamente. `public/samples/` contiene dos CSV sintéticos de 20 filas, encabezados diferentes, personas repetidas, faltantes y fechas inválidas.

Rutas: `/login`, `/campo`, `/admin`, `/admin/pacientes`, `/admin/conflictos`, `/admin/bitacora`, `/admin/jornadas`, `/admin/pap`, `/admin/impacto` y `/resultado/[token]`. Jornadas, PAP, Impacto y portal siguen siendo bases para próximas fases.

## Fase 2 · Identidad y atención clínica

- Campo permite seleccionar una jornada **Activa**, capturar paciente + servicio/insumo y revisar coincidencias locales mientras se escribe. La migración activa únicamente la jornada sintética `JOR-001` original sin modificaciones; no altera jornadas ya gestionadas.
- `lib/matching.ts` normaliza acentos/caso y aplica Jaro-Winkler, fecha exacta/parcial, últimos siete dígitos telefónicos, municipio y CURP exacta/parcial. Umbral `0.70`; se muestran razones. Es una ayuda, no una prueba de identidad. La comparación exige **misma paciente** o **otra persona** antes de guardar; cerrar no confirma ni fusiona. La primera agrega solo una atención y, opcionalmente, los contactos seleccionados. La segunda crea un UUID temporal que se estabiliza al sincronizar. Ambas decisiones quedan en la outbox y la bitácora.
- Expedientes busca UUID, nombre normalizado, nacimiento, teléfono, municipio y CURP. Las visitas cuentan `visit_id` únicos; los registros anteriores sin ese campo usan fecha+jornada. El directorio separa atenciones no-estudio y estudios. La ficha muestra historial cronológico y envía únicamente campos de contacto seleccionados y realmente modificados.
- Revisión Mamaria y Citología Cervical digitalizan los reactivos de los documentos en `docs/`, guardados como `categoria: Estudio` y `form_data`. Identificación precargada, opciones originales, multiselección donde corresponde, vista imprimible y pie EIRA. Brigadista/médico/admin capturan; **solo médico/laboratorio** pueden cambiar BIRADS y resultados citológicos. Laboratorio no crea estudios ni cambia identificación. El servidor valida estas restricciones incluso con llamadas directas a la API.
- Administración revisa conflictos y pares probables. Vincular requiere escoger UUID a conservar y confirmar; mueve atenciones, conserva el UUID secundario como `merged_into` y alias y redirige referencias offline posteriores. No elimina expedientes. “Son personas distintas” se recuerda. Las decisiones administrativas son exclusivas de admin y auditadas.
- Bitácora es de solo lectura, con filtros por usuario, rol, módulo, acción, entidad y fecha; exportación CSV filtrada. `/admin` muestra pacientes únicas, atenciones, pendientes locales y conflictos abiertos.
- Todos los guardados pasan primero por Dexie. En offline simulado, Campo compara, registra decisiones y muestra historial sin llamadas API. Para abrir fichas/formularios con desconexión real, visítalos primero online: el service worker conserva sus pantallas visitadas, no las APIs, bitácora ni conflictos. Sincroniza al volver online; utiliza el botón para enviar nuevas ediciones realizadas online.

### Verificación reproducible

```sh
npm test # contratos existentes, matching, formularios/RBAC, decisiones y conflictos
npm run build
npm start
# En otra terminal; agrega datos SINTÉTICOS y una decisión a la demo en ejecución:
npx playwright install chromium
node scripts/phase2-check.mjs
```

El script Playwright headless prueba la captura offline de `Maria Guadalupe Lopez`, comparación obligatoria, misma paciente con segunda visita, cero llamadas API offline y cero pendientes al reconectar. También verifica contactos selectivos, formularios, permisos de resultados, resolución de conflicto, descarte recordado, filtros/CSV y KPIs. Guarda cuatro PNG y un PDF imprimible en `~/screenshots/nexo-phase2`; acepta `BASE_URL` y `EVIDENCE_DIR`. No requiere servicios externos ni modifica datos reales.

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

No usar con datos reales. Faltan rotación de sesiones, recuperación de contraseña, rate limiting, cifrado de dispositivo y escaneo antivirus. El portal PAP no emite tokens ni notificaciones. La versión Next 14 fue exigida por el alcance; `npm audit` reporta vulnerabilidades del framework sin parche en la serie 14 (actualizar a una versión mantenida requiere cambiar esa decisión). No exponer la demo a internet ni considerarla lista para producción.
