# Gestión PRO - App de Gestión de Producción y Cambios

**Gestión PRO** es una aplicación web completa diseñada para la gestión integral de procesos de producción industrial y cambios de ingeniería. Construida con JavaScript puro y Firebase, ofrece una solución robusta para administrar el ciclo de vida completo de productos y sus modificaciones.

## Features at a Glance

-   **Gestión de Datos Centralizada:** Administra productos, semiterminados, insumos, clientes, proveedores, y más.
-   **Editor de Árboles de Producto (BOM):** Construye y visualiza las complejas jerarquías de componentes con una interfaz de arrastrar y soltar (Drag and Drop).
-   **Módulo de Cambios de Ingeniería (ECR/ECO):** Un flujo de trabajo completo desde la Solicitud de Cambio (ECR) hasta la Orden de Cambio (ECO), con circuito de aprobaciones y planes de acción.
-   **Panel de Control Avanzado:** Visualiza métricas, KPIs y el estado general de los procesos de cambio.
-   **Gestión de Tareas (Kanban):** Un tablero Kanban para organizar y seguir tareas personales o de equipos de ingeniería.
-   **Autenticación y Roles de Usuario:** Sistema seguro de inicio de sesión con diferentes niveles de permisos (Administrador, Editor, Lector).
-   **Notificaciones en Tiempo Real:** Mantén a los usuarios informados sobre asignaciones de tareas y cambios de estado importantes.
-   **Exportación a PDF:** Genera reportes profesionales de Listas de Materiales (BOM) y otros documentos clave.
-   **Tutoriales Interactivos:** Guías paso a paso para que los nuevos usuarios aprendan a usar las funcionalidades clave.

## Core Technologies

-   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
-   **Backend & Base de Datos:** Google Firebase (Firestore, Authentication, Functions, Hosting)
--   **UI y Componentes:**
    -   **Lucide Icons:** para iconografía.
    -   **SortableJS:** para la funcionalidad de arrastrar y soltar.
    -   **Chart.js:** para la visualización de datos en dashboards.
    -   **jsPDF & html2canvas:** para la generación de reportes en PDF.
-   **Pruebas:** Jest

## Getting Started

Para ejecutar la aplicación localmente, puedes simplemente abrir el archivo `index.html` en un navegador web. Sin embargo, para una experiencia de desarrollo completa y para interactuar con el backend de Firebase, se recomienda usar un servidor local.

1.  **Requisitos Previos:**
    -   Node.js y npm instalados.
    -   Firebase CLI instalado (`npm install -g firebase-tools`).

2.  **Servidor Local con Firebase:**
    -   Inicia sesión en Firebase: `firebase login`
    -   Inicia el emulador de Firebase desde la raíz del proyecto:
        ```bash
        firebase emulators:start
        ```
    -   La aplicación estará disponible en la URL que se muestra en la consola (generalmente `http://localhost:5000`).

## Arquitectura y Lógica Clave

El proyecto ha evolucionado desde un prototipo hasta una aplicación robusta, enfocada en la integridad de los datos, la experiencia de usuario y una arquitectura de software sólida.

### 1. Gestión de Datos
-   **Estado Global (`appState`):** La aplicación utiliza un objeto de estado global que se mantiene sincronizado en tiempo real con Firestore, proporcionando una única fuente de verdad.
-   **Single Source of Truth:** Se eliminó la duplicación de datos. Los "árboles de producto" solo almacenan IDs de referencia (`refId`), y toda la información del componente se obtiene en tiempo real desde los mapas de datos cacheados en `appState.collectionsById`.
-   **Transacciones:** Las operaciones críticas, como la creación de documentos con claves únicas, se realizan dentro de transacciones de Firestore para garantizar la atomicidad y prevenir conflictos.

### 2. Módulo de Cambios de Ingeniería (ECR/ECO)

El sistema digitaliza el proceso formal de modificaciones de la compañía.

-   **Flujo de Trabajo:**
    1.  **ECR (Solicitud):** Un usuario crea un ECR para proponer un cambio.
    2.  **Aprobación Departamental:** El ECR circula por los departamentos relevantes (`Calidad`, `Compras`, etc.) para su evaluación. Cada departamento emite una aprobación o rechazo.
    3.  **Máquina de Estados:** El estado del ECR cambia automáticamente a `approved` si todos aprueban, o a `rejected` si uno solo rechaza.
    4.  **ECO (Orden):** Un ECR aprobado se convierte en un ECO, que es el documento para ejecutar el cambio.
    5.  **Plan de Acción:** El ECO incluye un plan de acción con tareas asignables para gestionar la implementación.
    6.  **Cierre:** El ECO se cierra una vez que todas las tareas del plan de acción se completan.

-   **Flujo PPAP (Proceso de Aprobación de Partes de Producción):** Para cambios críticos, el formulario ECO incluye un bloqueo de seguridad que impide su cierre hasta que se confirme la finalización del PPAP con el cliente, asegurando la validación externa antes de la implementación interna.

### 3. Panel de Control y Métricas

El Panel de Control ofrece una visión centralizada y estratégica del proceso de cambios.

-   **Tabla de Control ECR:** Una vista tabular detallada con filtros avanzados para un análisis profundo de todos los ECRs.
-   **Indicadores ECM:** Un dashboard con KPIs (Key Performance Indicators) y gráficos sobre el rendimiento del proceso de ECR/ECO.
-   **Seguimiento y Métricas:** Herramientas para registrar y analizar la asistencia a reuniones de seguimiento, ayudando en la gestión del equipo.

## Panel de Administración

El dashboard incluye un panel de administración (visible solo para Super Admins) con herramientas para gestionar el estado de la base de datos.

-   **Limpiar y Cargar Datos:** Borra todas las colecciones (excepto usuarios) y carga un conjunto de datos de demostración.
-   **Borrar Solo Datos:** Borra todas las colecciones de datos pero mantiene intacta la colección de usuarios.
-   **Borrar Otros Usuarios:** Elimina todos los documentos de la colección `usuarios`, excepto el del administrador principal.

### Usuario Administrador Principal

Para facilitar las pruebas y la gestión, existe un usuario "Dios" con privilegios de super administrador.

-   **Email:** `f.santoro@barackmercosul.com`
-   **Contraseña:** `123456`

## Pruebas Automatizadas

El proyecto utiliza **Jest** para pruebas unitarias y de integración. Esto garantiza que las funciones clave del sistema operen como se espera y ayuda a prevenir regresiones.

-   **Ejecutar las Pruebas:**
    ```bash
    npm test
    ```
-   Este comando buscará y ejecutará todos los archivos `.test.js` en el proyecto.

## Nota sobre `AGENTS.md`

Este repositorio contiene un archivo `AGENTS.md`. Este fichero está destinado específicamente a proporcionar instrucciones y directrices a los asistentes de IA (como Jules) que colaboran en el proyecto. Para la documentación general del proyecto, por favor, refiérase a este `README.md`.
