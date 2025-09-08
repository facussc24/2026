# Módulo de Hotspots (HotspotModule)

Este documento proporciona la documentación técnica para el `HotspotModule`, un componente de JavaScript diseñado para ser reutilizable y permitir la creación, visualización y edición de áreas interactivas (hotspots) sobre una imagen.

## 1. Inicio Rápido

Para utilizar el módulo, primero asegúrate de tener la estructura HTML necesaria y luego inicializa el módulo con un script de tipo `module`.

### Estructura HTML Requerida

El módulo necesita un contenedor principal que contenga una imagen y un elemento SVG.

```html
<!-- Contenedor principal para el módulo -->
<div id="hotspot-viewer" class="vhm-container">
    <!-- La imagen sobre la que se dibujarán los hotspots -->
    <img src="/path/to/your/image.jpg" class="vhm-image" alt="Imagen base">

    <!-- El SVG donde se renderizarán los polígonos -->
    <svg class="vhm-svg" preserveAspectRatio="none"></svg>
</div>
```

### Script de Inicialización

```html
<script type="module">
    import HotspotModule from './hotspot-module.js';

    // Datos iniciales (opcional)
    const misHotspots = [
        {
            id: 'pieza-1',
            name: 'Pieza de Ejemplo',
            points: [ { "x": 0.1, "y": 0.1 }, { "x": 0.2, "y": 0.1 }, { "x": 0.15, "y": 0.2 } ]
            // ... otros campos de datos
        }
    ];

    // Inicializar el módulo
    HotspotModule.init('#hotspot-viewer');

    // Cargar los datos
    HotspotModule.loadHotspots(misHotspots);

    // Escuchar eventos del módulo
    HotspotModule.on('select', (hotspot) => {
        if (hotspot) {
            console.log('Hotspot seleccionado:', hotspot.name);
            // Aquí puedes mostrar los detalles en un panel lateral
        }
    });
</script>
```

## 2. Descripción de la API

El `HotspotModule` expone una API clara para su manipulación.

---

### `init(containerSelector, options)`
Inicializa el módulo en el contenedor especificado.

-   `containerSelector` (String): Selector CSS para el elemento contenedor.
-   `options` (Object, opcional): Opciones de configuración.
    -   `imageSelector` (String): Selector para el `<img>` dentro del contenedor. Default: `.vhm-image`.
    -   `svgSelector` (String): Selector para el `<svg>` dentro del contenedor. Default: `.vhm-svg`.

---

### `loadHotspots(hotspotsArray)`
Carga un array de objetos hotspot en el visualizador, reemplazando los existentes.

-   `hotspotsArray` (Array): Un array de objetos hotspot. Ver la sección "Estructura de Datos" para más detalles.

---

### `enterEditMode()` / `exitEditMode()`
Activa o desactiva el modo de edición, que permite crear, modificar y eliminar hotspots.

---

### `startDrawing()`
Pone el módulo en estado de dibujo para crear un nuevo polígono. Solo funciona en modo edición. Haz clic en la imagen para añadir puntos.

---

### `finishDrawing()`
Completa el polígono que se está dibujando actualmente.

---

### `deleteHotspot(hotspotId)`
Elimina un hotspot específico por su ID.

-   `hotspotId` (String): El ID del hotspot a eliminar.

---

### `updateHotspot(hotspotId, data)`
Actualiza los datos de un hotspot existente.

-   `hotspotId` (String): El ID del hotspot a actualizar.
-   `data` (Object): Un objeto con las propiedades a modificar (ej. `{ name: "Nuevo Nombre" }`).

---

### `exportJSON()`
Devuelve una cadena de texto en formato JSON con los datos de todos los hotspots actuales.

-   **Retorna**: `String`

---

### `importJSON(jsonString)`
Carga un conjunto de hotspots desde una cadena de texto JSON.

-   `jsonString` (String): La cadena JSON a importar.

---

### `getState()`
Devuelve una copia del estado interno del módulo, útil para depuración o para construir UIs reactivas.

-   **Retorna**: `Object`

---

### `on(eventName, callback)`
Registra una función para que se ejecute cuando ocurra un evento específico.

-   `eventName` (String): El nombre del evento. Eventos soportados:
    -   `'load'`: Se dispara cuando se cargan nuevos hotspots con `loadHotspots` o `importJSON`.
    -   `'change'`: Se dispara cada vez que un hotspot es añadido, modificado o eliminado. El `detail` del evento contiene `{ action, hotspot, hotspots }`.
    -   `'select'`: Se dispara cuando un usuario selecciona o deselecciona un hotspot. El `detail` es el objeto del hotspot o `null`.
    -   `'editModeEnter'` / `'editModeExit'`: Se disparan al cambiar de modo.
    -   `'hotspotUpdate'`: Se dispara cuando los datos de un hotspot son actualizados.
-   `callback` (Function): La función a llamar. Recibe el detalle del evento como argumento.

---

### `destroy()`
Limpia todos los event listeners y elimina el contenido del contenedor para una desinstalación segura.

## 3. Estructura de Datos (`hotspotsArray`)

El módulo espera que los hotspots sean un array de objetos con la siguiente estructura. El único campo requerido es `points`.

```javascript
[
    {
        "id": "hotspot_1678886400000", // Se recomienda un ID único
        "name": "Nombre de la Pieza",
        "partNumber": "PN-12345",
        "description": "Descripción detallada de la pieza.",
        "imageUrl": "https://example.com/image.png",
        "points": [
            { "x": 0.496, "y": 0.222 }, // Coordenadas normalizadas (0 a 1)
            { "x": 0.560, "y": 0.246 },
            { "x": 0.538, "y": 0.334 },
            { "x": 0.478, "y": 0.304 }
        ]
    }
]
```

## 4. Integración y Decisiones de Diseño

### Pasos para Integrar en el Repositorio Actual

1.  **Reemplazar `index.html`**: Se recomienda renombrar `public/demo.html` a `public/index.html` para usar la nueva versión modular. El archivo `public/script.js` original ya ha sido eliminado.
2.  **Gestión de Datos con Firebase**: El módulo no tiene dependencias directas con Firebase. La carga y guardado de datos debe ser gestionada por la aplicación principal.

    -   **Para cargar datos**: Obtén el JSON de hotspots desde Firestore y pásalo a `HotspotModule.loadHotspots(data)`.
    -   **Para guardar datos**: Escucha el evento `'change'` del módulo. Cuando se dispare, toma el resultado de `HotspotModule.exportJSON()` y guárdalo en Firestore.

    ```javascript
    // Ejemplo de cómo guardar cambios en Firestore
    HotspotModule.on('change', (event) => {
        const jsonToSave = HotspotModule.exportJSON();
        // Lógica para guardar `jsonToSave` en tu documento de Firestore
        // db.collection('vehiculos').doc('maxus').update({ hotspots: jsonToSave });
        console.log('Cambio detectado, listo para guardar:', event);
    });
    ```
3.  **Formato del Módulo**: Se eligió un **ES Module** que también se expone como variable global (`window.HotspotModule`). Esto ofrece compatibilidad moderna con `import` y a la vez permite su uso en entornos más antiguos que solo usan etiquetas `<script>`.

### Plan para Deshacer/Rehacer (Undo/Redo)

La implementación de Undo/Redo no se incluyó en esta fase para priorizar la modularización. Sin embargo, la arquitectura actual lo facilita.

**Propuesta de Implementación:**

1.  **Stack de Historial**: Crear un array (stack) dentro del estado del módulo para guardar el historial de `state.hotspots`.
2.  **Capturar Cambios**: En el evento `change`, en lugar de solo emitir, se guardará una copia profunda del array `state.hotspots` en el stack de historial. Se debe gestionar un puntero para saber en qué punto del historial nos encontramos.
3.  **Nuevos Métodos de API**:
    -   `undo()`: Mueve el puntero del historial hacia atrás y carga el estado previo de los hotspots.
    -   `redo()`: Mueve el puntero hacia adelante.
4.  **Lógica de Ramificación**: Si se realiza un nuevo cambio después de un `undo`, el historial futuro (redo stack) debe ser eliminado para crear una nueva rama de cambios, que es el comportamiento estándar en sistemas de deshacer.

Esta implementación se puede añadir de forma no disruptiva en una futura iteración.
