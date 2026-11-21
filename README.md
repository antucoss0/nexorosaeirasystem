# Nexo Rosa · EIRA System

Plataforma local-first de cuidado y coordinación comunitaria. Interfaz en español; **solo datos sintéticos**. Fases 1–4: captura e identidad asistida, formularios clínicos, coordinación municipal y cartas, entrega segura de documentos e impacto con calidad de datos.

Licencia [MIT](LICENSE). Copyright © 2026 EIRA Movimiento Rosa A.C. y colaboradores.

## Inicio local

Requiere Node.js 20 LTS y npm. En esta máquina: `source ~/.nvm/nvm.sh && nvm use 20`.

```sh
npm ci
npm run build
npm start # http://localhost:3000
```

También: `PORT=3100 DATA_DIR=/ruta/persistente npm start`. `DATA_DIR` contiene `nexo.db` y `files/`; si no se define se usa `./data`. El puerto se toma del entorno por Next CLI (no está fijado con `-p`). Landing pública `/` y guía `/guia` con recorridos y accesos.

### Hospedaje detrás de proxy autenticado

El service worker es opcional: se intenta registrar solo en localhost (incluye 127.0.0.1/IPv6) o compilando con `NEXT_PUBLIC_ENABLE_SW=1`. No habilitarlo si el proxy rechaza scripts SW: errores de registro no impiden usar la aplicación. Dexie, outbox y el modo offline simulado no dependen de él; sin SW no se garantiza recargar páginas con desconexión real. El manifest usa credenciales y sus iconos son rutas relativas al mismo origen.

El proxy debe establecer/sanear `X-Forwarded-Host` y `X-Forwarded-Proto` para reflejar el origen público. Los enlaces del portal usan esos encabezados, luego Host/URL de la solicitud; no hay fallback a localhost. `APP_ORIGIN` permite fijar explícitamente un origen público. No aceptar encabezados forwarded arbitrarios de clientes sin un proxy confiable delante.

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

- Next.js 15 App Router, React 19, TypeScript, Tailwind, lucide-react y Montserrat. Diseño de alto contraste, rosa mexicano, bordes de 1 px, sin sombras difusas. Campo adapta navegación y formularios a móvil.
- `lib/db.ts`: SQLite (`better-sqlite3`) en `data/nexo.db`, WAL y transacciones. Usuarios con bcrypt, pacientes, atenciones, jornadas, conflictos, historial por versión, operaciones aplicadas, archivos y bitácora. Los campos de dominio están en JSON; identificadores, versiones, autor y fecha son columnas; las atenciones tienen FK real a pacientes.
- `lib/auth.ts`: JWT HS256 de 12 horas (`jose`), cookie httpOnly SameSite=Lax. Una clave aleatoria persistida en SQLite firma las sesiones si no se configura `SESSION_SECRET`. `COOKIE_SECURE=true` para HTTPS. Middleware redirige sin cookie y el layout servidor valida firma y usuario; cada API verifica sesión y permisos independientemente.
- `lib/rbac.ts`: permisos centrales. Brigadista captura; médico autoriza PAP; laboratorio carga PDF; solo admin aprueba requisitos. Municipio recibe únicamente jornadas de su municipio y no puede cambiar municipio, cartas, estado general ni aprobaciones. No existe una API pública que edite usuarios o auditoría.
- `lib/local.ts`: Dexie aislado por usuario. Pacientes, atenciones, jornadas, decisiones y outbox. `localWrite` hace una transacción local antes de cualquier red y agrupa ediciones pendientes de la misma entidad, conservando las respuestas clínicas no modificadas. Operaciones: `opId`, `table`, `entityId`, `type`, `patch`, `baseVersion`, `createdAt`.
- `POST /api/sync/push`: lotes de hasta 100, ordenados como se envían, atómicos; deduplicación por `opId`. El servidor asigna `EIRA-MX-001…`, devuelve remaps desde `EIRA-TMP-*` y remapea referencias de atenciones del mismo lote. Cliente remapea también referencias y operaciones todavía pendientes.
- Conflictos: compara cada campo del parche con el historial de `baseVersion` y la versión actual, incluidas respuestas individuales de `form_data`. Cambios disjuntos se combinan; cambios sobre el mismo campo crean un conflicto persistente y una entrada de bitácora, sin sobrescribir el servidor. Cliente marca `sync_status=conflict`; el parche original queda en `conflicts`. Administración elige por campo y envía una decisión inmutable, con control de versión y auditoría.
- `GET /api/sync/pull?since=<ISO>` devuelve registros cambiados y cursor. Consulta inclusiva para evitar pérdidas en el mismo milisegundo; la siguiente descarga es idempotente. No reemplaza registros locales pendientes o en conflicto.
- Barra global: conectividad real + simulada persistente, contador pendiente, sincronización manual y automática al volver online. Los fetch del cliente se bloquean cuando está offline; el service worker sirve caché sin red en modo simulado. Una solicitud ya iniciada antes del cambio puede terminar; no se inicia otra.
- PWA: manifiesto y service worker básico para recursos estáticos, página offline y shell visitado. Las APIs nunca se cachean. Los shells autenticados se eliminan en login/logout exitosos; no se cachean bitácora o conflictos. Abrir el espacio una vez online antes de usarlo sin conexión. IndexedDB conserva información por dispositivo; no compartir perfiles de navegador. No es un sistema de almacenamiento clínico cifrado.
- `audit_logs` es append-only incluso en SQLite mediante triggers. Cada operación aplicada y conflicto queda auditado. `POST /api/files` acepta PDF de laboratorio o requisitos municipales PDF/PNG/JPEG (10 MB), con archivos en `data/files` y metadatos/contexto en tablas. Descarga de personal autenticado y autorizado por contexto: `GET /api/files/[id]`. La entrega personal usa `/resultado/[token]` y una sesión limitada a un documento; ver Fase 3.

## Datos y pantallas

Seed: 3 jornadas (Zapotlán el Grande / Ciudad Guzmán, Tuxpan, Gómez Farías), 10 pacientes, 18 atenciones en cinco categorías. Dos pares de nombres deliberadamente similares; nunca se fusionan automáticamente. `public/samples/` contiene dos CSV sintéticos de 20 filas, encabezados diferentes, personas repetidas, faltantes y fechas inválidas.

Rutas públicas: `/`, `/guia`, `/login` y `/resultado/[token]`. Módulos protegidos: `/campo`, `/admin`, `/admin/pacientes`, `/admin/conflictos`, `/admin/bitacora`, `/admin/jornadas`, `/admin/pap` y `/admin/impacto`.

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

## Fase 3 · Jornadas y entrega segura

- Marca actualizada: corazón, manos y cruz rosa, sin el monograma anterior.
- `/admin/jornadas`: alta/edición administrativa, servicios múltiples, responsables, enlace y checklist configurable. Municipio solo consulta sus jornadas y sube PDF/PNG/JPEG a cada requisito (10 MB); las correcciones, reentregas y aprobaciones conservan historial y auditoría. Semáforo: verde con todo aprobado, amarillo con pendientes a más de siete días, rojo con observaciones o fecha cercana/vencida. El enlace municipal ve sus avisos; los recordatorios amables se registran en `notifications`, uno por requisito cada 24 horas, sin envío real.
- Carta Compromiso: seis cláusulas protegidas en servidor, plantilla versionada y SHA-256 verificado antes de descargar. Solo las variables cambian; cada emisión agrega una versión inmutable con autor, fecha y diff. `pdf-lib` genera el PDF institucional descargable con contacto EIRA. La sincronización genérica no puede modificar requisitos ni versiones de cartas.
- `/admin/pap`: laboratorio carga PDF con MIME y firma `%PDF-` correctos (10 MB), verifica dos atributos distintos contra el expediente y lo asocia. Incluye generador sintético. Admin revisa identidad/legibilidad o devuelve con nota; únicamente Médico autoriza. Después, admin notifica, revoca/regenera o registra entrega asistida con promotora, método, fecha y firma de recibido. Hay filtros y alerta no leído >48 h.
- Portal `/resultado/[token]`: no requiere cuenta; exige enlace válido y nacimiento o últimos cuatro dígitos de teléfono. Cinco fallos bloquean el token. La sesión HttpOnly dura diez minutos, está limitada a la ruta de ese documento y también caduca/revoca junto con el token. Solo abrir/descargar el PDF registra `Consultado`; la URL original de archivos nunca es pública.
- Tokens aleatorios de 256 bits, solo hashes SHA-256 persistidos. **Para no guardar el token dentro del texto del SMS/email simulado**, `notifications` conserva el mensaje neutral con `{{enlace_privado}}`; el enlace real aparece únicamente en la respuesta/vista previa al emitir. Regenerar invalida el anterior. El guardia del servidor rechaza términos clínicos; nunca se envía SMS/email real. Vigencia predeterminada 72 h, configurable entre 1 y 168 h.
- Seed idempotente al abrir PAP: tres documentos sintéticos en distintos estados, uno sin leer desde hace 60 h y una paciente sintética adicional sin teléfono propio. Los archivos se guardan bajo `data/files`, protegidos por contexto y rol. Configura `APP_ORIGIN` si la URL pública difiere del origen del servidor y `COOKIE_SECURE=true` bajo HTTPS.
- Los nuevos circuitos de aprobación, carga de archivos y entrega requieren conexión y confirman sus transacciones en servidor; no se simulan aprobaciones offline. La infraestructura Dexie/outbox de Campo y los formularios de Fase 2 sigue funcionando sin cambios en su contrato.

Verificación (con servidor de producción en ejecución):

```sh
npm test
npm run build
node scripts/phase3-check.mjs
```

El script crea una jornada sintética, genera carta v1, carga/revisa/corrige/reentrega/aprueba, comprueba el semáforo y descarga la carta. También completa laboratorio → admin → médico → mensaje neutral → portal verificado → descarga → Consultado, entrega asistida y revocación. Evidencias en `~/screenshots/nexo-phase3` (cuatro PNG y dos PDF). Acepta `BASE_URL` y `EVIDENCE_DIR`. No usar con información real; faltan endurecimiento operativo, cifrado local, antivirus, rate limiting por IP y entrega de comunicaciones reales.

## Fase 4 · Calidad de datos e impacto

`/admin/impacto` es exclusivo de administración; no se habilitó la vista opcional de dirección para Médico. CSV UTF-8 y XLSX mediante **ExcelJS 4.4** (no se usa npm xlsx). Se lee la primera hoja, con límites de 5 MB de archivo, 20 MB descomprimidos declarados, 2000 filas y 60 columnas. El mapeo sugiere sinónimos/encabezados similares, requiere confirmación y guarda columnas/valores fijos por fuente. Hay doce campos documentados en el diccionario.

Las reglas revisan requeridos, fechas reales/rangos, teléfono, CURP, categoría, cantidad y unidad; comparan nombres/identidad con expedientes, personas importadas y filas anteriores del lote. Las discrepancias y coincidencias son avisos, nunca fusiones automáticas. Cada fila exige identidad explícita (UUID existente, fila previa o nuevo ID `IMP-PER-*`) y resolución de anomalías: excluir, corregir con motivo o aceptar conservando el aviso. Las fechas inválidas aceptadas quedan identificadas y no entran en filtros de periodo. Un ajuste conserva datos originales, antes/después, responsable, fecha y motivo en la bitácora append-only.

`import_batches` y `import_rows` constituyen staging trazable; filas consolidadas son inmutables. `import_people` identifica personas nuevas sin crear expedientes clínicos. Los UUID/ID confirmados se cuentan mediante DISTINCT; alias clínicos se llevan al UUID principal. Una actividad importada idéntica (persona, fecha, categoría, servicio, programa, cantidad, unidad y municipio) se cuenta una vez entre fuentes, conservando su procedencia; no se colapsan dos registros nativos legítimos. La calidad de la vinculación humana determina la calidad del conteo.

Los indicadores separan personas, actividades totales y cada categoría. **Atenciones por persona = registros categoría Atención / personas únicas**; cantidad/unidad no multiplica personas ni mezcla piezas con paquetes. Sin filtros, el universo incluye expedientes activos y personas importadas incluidas; con filtros, personas con actividad en la selección. Cada tarjeta documenta corte, denominador, fuentes y fórmula; gráficos Recharts por mes, municipio y categoría. CSV y PDF institucionales incluyen filtros, indicadores y anexo de ajustes. Exportación CSV neutraliza fórmulas de hojas de cálculo.

El dashboard agrega personas de todas las fuentes, pendientes municipales críticos, PAP sin leer >48 h y conflictos. Conserva los cuatro KPIs locales originales. Nuevos flujos administrativos requieren conexión; Campo/Dexie sigue siendo local-first.

```sh
npm run build
npm audit --omit=dev
npm test
node scripts/phase4-check.mjs
node scripts/phase2-check.mjs
node scripts/phase3-check.mjs
```

Evidencia de impacto en `~/screenshots/nexo-phase4`: mapeo, calidad, indicadores, landing, guía, `informe-impacto.csv` e `informe-impacto.pdf`. Los scripts aceptan `BASE_URL`; fase 4 también `EVIDENCE_DIR`. Cada ejecución crea datos sintéticos adicionales y conserva su auditoría; las actividades importadas repetidas se deduplican por su clave común.

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

No usar con datos reales. Faltan rotación de sesiones, recuperación de contraseña, rate limiting por IP, cifrado de dispositivo y escaneo antivirus. Las notificaciones son simuladas, no envíos reales. En Fase 4 se actualizó a Next 15.5.29 y React 19, con APIs asíncronas de params/cookies. Overrides compatibles de PostCSS 8.5.33 y uuid 11.1.1 eliminan avisos transitivos de Next y ExcelJS, sin ocultarlos del audit. No exponer la demo a internet ni considerarla lista para producción.
