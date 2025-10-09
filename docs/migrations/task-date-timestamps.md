# Migración de fechas de tareas a `Timestamp`

Este repositorio ahora persiste los campos `startDate`, `dueDate` y `endDate`
de las tareas como instancias de `Timestamp` de Firestore. Los registros
existentes que aún guardan strings (`"2024-05-01"`) o fechas de JavaScript
deben migrarse para evitar inconsistencias en el timeline y en los filtros.

## Script de migración

Se agregó el script `functions/scripts/migrate-task-date-timestamps.js` para
automatizar la conversión:

```bash
cd functions
node scripts/migrate-task-date-timestamps.js
```

### Requisitos previos

1. Configurá `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un archivo JSON de un
   servicio de Firebase con permisos de lectura y escritura sobre la colección
   `tareas`.
2. Asegurate de haber instalado las dependencias en `functions/` (`npm install`).
3. Ejecutá el comando desde la carpeta `functions/` usando Node.js 20 (la misma
   versión configurada para las Cloud Functions).

El script revisa cada documento en `tareas` y actualiza los campos de fecha
cuando detecta strings o `Date`. Los registros que ya tienen `Timestamp` se
marcan como omitidos y no se reescriben.

## Alternativa manual

Si preferís realizar la migración manualmente desde la consola de Firebase:

1. Abrí la colección `tareas` en Firestore.
2. Para cada documento con fechas almacenadas como string, editá los campos
   `startDate`, `dueDate` y `endDate` seleccionando el tipo `timestamp` y
   especificando la fecha correspondiente (00:00:00 en tu zona horaria).
3. Guardá los cambios y repetí para todos los documentos relevantes.

> **Sugerencia:** Ejecutar el script es el método recomendado para bases de
datos con más de unos pocos documentos, ya que evita errores de tipeo y asegura
consistencia entre los tres campos de fecha.
