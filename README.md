# Gestión PRO - App de Gestión de Producción

**Gestión PRO** es una aplicación web completa diseñada para la gestión integral de procesos de producción industrial. Permite administrar productos, semiterminados, insumos, clientes, proveedores y otras entidades clave del negocio. Su funcionalidad central es la capacidad de construir y visualizar las complejas relaciones jerárquicas entre componentes a través de "árboles de producto" dinámicos.

La aplicación está construida con HTML, CSS y JavaScript puro, y utiliza **Firebase** como backend para la autenticación, base de datos en tiempo real (Cloud Firestore) y hosting.

## Flujo de Trabajo y Colaboración

Este proyecto sigue un flujo de trabajo colaborativo en el que el desarrollador principal dirige el proyecto y un asistente de IA se encarga de la implementación de código bajo instrucciones específicas. El proceso es el siguiente:

1.  **Requerimiento/Idea:** El desarrollador expone una necesidad, un bug o una nueva funcionalidad.
2.  **Análisis y Propuesta:** El asistente de IA analiza el código, propone una o varias soluciones detalladas, explicando el impacto y la complejidad.
3.  **Decisión:** El desarrollador, como director del proyecto, decide qué solución implementar.
4.  **Implementación:** Siguiendo las directrices del desarrollador, el asistente de IA se encarga de la implementación técnica, modificando todos los archivos necesarios del proyecto (`index.html`, `main.js`, `style.css`, etc.) para llevar a cabo la tarea.
5.  **Validación y Deploy:** El desarrollador revisa y valida todos los cambios antes de realizar el deploy.

Este método asegura que la dirección estratégica y la visión del producto permanezcan con el desarrollador, mientras que el asistente de IA se enfoca en la implementación y ejecución técnica para acelerar el desarrollo.

## Mejoras Clave Implementadas

El proyecto ha evolucionado desde un prototipo hasta convertirse en una aplicación robusta y escalable, con un enfoque en la integridad de los datos, la experiencia de usuario y una arquitectura de software sólida.

### 1. Arquitectura y Backend
- **Refactorización Inicial:** Se migró de un código monolítico a una estructura clara con archivos `index.html`, `style.css` y `main.js`.
- **Integración con Firebase:** Se implementó un backend completo con Firebase Hosting, Authentication y Cloud Firestore.
- **Seguridad:** Se establecieron reglas en Firestore para que solo los usuarios autenticados puedan acceder y modificar los datos.

### 2. Gestión de Datos y Robustez del Sistema
- **Modelo de Datos Centralizado:** La aplicación utiliza un estado global (`appState`) que se mantiene sincronizado en tiempo real con Firestore, proporcionando una única fuente de verdad.
- **Datos Siempre Actualizados (Single Source of Truth):** Se eliminó la duplicación de datos en los árboles de producto. Ahora, los nodos del árbol solo almacenan un ID de referencia (`refId`), y toda la información se obtiene en tiempo real desde los mapas de datos.
- **Transacciones y Bloqueo Pesimista:** Se utilizan transacciones de Firestore para operaciones críticas y un sistema de bloqueo de documentos para prevenir que dos usuarios editen el mismo ítem simultáneamente.

### 3. Funcionalidad y Experiencia de Usuario (UX)
- **Gestión Completa de Entidades (CRUD):** Se implementó la funcionalidad completa para crear, leer, actualizar y eliminar todas las entidades del sistema.
- **Selectores de Búsqueda Inteligentes:** Se reemplazaron los campos de texto libre por modales de búsqueda controlados, eliminando errores de tipeo y estandarizando la entrada de datos.
- **Gestión Avanzada de Árboles de Producto:** Interfaz con Drag and Drop para construir y modificar las estructuras jerárquicas de los productos.
- **Vista Sinóptica Mejorada:** Una vista interactiva para explorar la estructura completa de todos los productos, con edición de cantidades en contexto y diferenciación visual de componentes.
- **Exportación de Estructura de Producto a PDF Profesional:** Se ha implementado una función de exportación que genera un listado de materiales (Estructura de Producto) en formato PDF tabular. El reporte se presenta en formato horizontal e incluye columnas detalladas para Nivel, Descripción, Código, Cantidad y Unidad de Medida.
- **Flujograma de Procesos:** Una nueva vista dedicada que lee la información de los árboles de producto para generar automáticamente un flujograma visual del proceso de fabricación completo. El diagrama, inspirado en la industria automotriz, muestra la jerarquía de componentes y sus relaciones, facilitando la comprensión del flujo de ensamblaje desde los insumos hasta el producto final.
- **Notificaciones de Nuevas Versiones:** Un sistema automatizado que notifica a todos los usuarios a través del centro de notificaciones (ícono de campana) cada vez que se publica una nueva versión de la aplicación. Los usuarios pueden ver las notas de la versión detalladas en un modal para mantenerse informados sobre las últimas mejoras y cambios.

### Gestión de Cambios de Ingeniería (ECR/ECO)

Para digitalizar y controlar el proceso formal de modificaciones de la compañía, el sistema incluye un módulo avanzado de ECR/ECO con un flujo de trabajo, notificaciones y planes de acción integrados.

#### 1. Flujo de Trabajo General: De ECR a ECO

El ciclo de vida de un cambio de ingeniería sigue un flujo estructurado:

1.  **Creación del ECR:** Un usuario (generalmente de `Ingeniería de Producto`) crea una **Solicitud de Cambio de Ingeniería (ECR)** para proponer una modificación. El ECR nace en estado `Draft` (borrador).
2.  **Inicio del Circuito de Aprobación:** Una vez que el ECR está completo, el creador lo envía a aprobación, cambiando su estado a `pending-approval`.
3.  **Aprobación Departamental:** El ECR circula por múltiples departamentos clave (`Calidad`, `Compras`, `Logística`, etc.) para su evaluación.
4.  **Decisión Final:**
    *   Si **todos** los departamentos requeridos aprueban el ECR, su estado cambia a `approved`.
    *   Si **un solo** departamento rechaza el ECR, su estado cambia inmediatamente a `rejected`.
5.  **Generación del ECO:** Un ECR aprobado puede ser convertido en una **Orden de Cambio de Ingeniería (ECO)**. Esta orden es el documento ejecutable que guía la implementación del cambio.
6.  **Implementación y Cierre:** El ECO se gestiona a través de un **Plan de Acción** hasta que todas las tareas se completan y el cambio se cierra formalmente.

#### 2. Lógica de Aprobación y Máquina de Estados

El corazón del módulo es una máquina de estados que gestiona el `status` del ECR basado en las decisiones de los departamentos.

-   **Modelo de Datos (`approvals`):** Cada documento ECR contiene un mapa (objeto) llamado `approvals`. Las claves de este mapa son los IDs de los departamentos (ej: `calidad`, `compras`), y cada valor es un objeto que registra la decisión:
    ```js
    {
      status: 'pending' | 'approved' | 'rejected', // La decisión del depto.
      user: 'Nombre del Aprobador', // Quién tomó la decisión.
      date: 'YYYY-MM-DD',           // Cuándo se tomó.
      comment: 'Comentario opcional...'
    }
    ```
-   **Permisos de Aprobación:**
    -   Un usuario solo puede aprobar/rechazar en nombre del departamento al que pertenece (según su `sector` en el perfil de usuario).
    -   Los usuarios con rol de `admin` pueden aprobar/rechazar en nombre de cualquier departamento.
    -   Una vez que un departamento ha emitido una decisión (`approved` o `rejected`), su sección en el formulario se bloquea y no puede ser modificada.
-   **Función `registerEcrApproval(ecrId, departmentId, decision, comment)`:** Esta es la función central que actúa como motor de la máquina de estados. Al ser llamada:
    1.  Valida que el usuario tenga permisos para actuar en nombre del `departmentId`.
    2.  Actualiza el mapa `approvals` con la nueva `decision`.
    3.  Evalúa el estado general del ECR:
        -   Si `decision` es `'rejected'`, el `status` del ECR cambia a `'rejected'`.
        -   Si `decision` es `'approved'`, verifica si todos los demás departamentos requeridos ya han aprobado. Si es así, el `status` del ECR cambia a `'approved'`.
        -   En cualquier otro caso, el `status` del ECR permanece como `'pending-approval'`.
    4.  Toda la operación se ejecuta dentro de una **transacción de Firestore** para garantizar la atomicidad y consistencia de los datos.

#### 3. Módulo de Plan de Acción (ECO)

Una vez que un ECO es generado, su propósito es la implementación. Para ello, el formulario de ECO incluye un módulo de "Plan de Acción".

-   **Funcionalidad:** Permite a los responsables del ECO crear una lista de tareas de implementación.
-   **Campos por Tarea:** Cada tarea del plan de acción incluye:
    -   Descripción de la tarea.
    -   **Responsable:** Un usuario asignado de la lista de usuarios del sistema.
    -   **Fecha Límite:** Una fecha de vencimiento.
    -   **Estado:** `pending` o `completed` (se gestiona con un checkbox).
-   **Persistencia:** El plan de acción completo (un array de objetos de tarea) se guarda como el campo `action_plan` dentro del documento del ECO en Firestore.

#### 4. Sistema de Notificaciones

Para mantener a todos los involucrados informados, el sistema cuenta con un centro de notificaciones en tiempo real.

-   **UI:** Un ícono de campana en la barra de navegación muestra el número de notificaciones no leídas y un panel con las últimas notificaciones.
-   **Eventos que Generan Notificaciones:**
    1.  **Asignación de Tarea en Plan de Acción:** Cuando se añade una tarea a un plan de acción y se le asigna un responsable, dicho usuario recibe una notificación.
        -   *Ejemplo:* "Se te ha asignado una nueva tarea en el plan de acción para el ECO: ECO-2024-015."
    2.  **Cambio de Estado de ECR:** Cuando un ECR cambia su estado final a `approved` o `rejected`, el usuario que creó el ECR recibe una notificación.
        -   *Ejemplo:* "El estado del ECR "ECR-2024-021" ha cambiado a approved."
    3.  **Publicación de Nueva Versión:** Cuando un administrador publica una nueva versión de la aplicación, todos los usuarios reciben una notificación para ver las novedades.
        -   *Ejemplo:* "¡Nueva versión disponible! v2.1.0 ya está aquí."
-   **Navegación:** Hacer clic en una notificación marca la misma como leída y redirige al usuario directamente al formulario del ECR o ECO correspondiente, o muestra un modal con detalles como en el caso de las notas de versión.

#### 5. Flujo de Aprobación de Partes de Producción (PPAP)

Para cambios que requieren una validación formal por parte del cliente, el sistema integra un control específico para el **Proceso de Aprobación de Partes de Producción (PPAP)**. Este flujo asegura que la implementación interna de un cambio (ECO) no se finalice hasta que se reciba y confirme la aprobación externa del cliente.

-   **Activación en el ECR:** Durante la creación de un ECR, el solicitante puede marcar la casilla **"Requiere PPAP"**. Esto indica que el cambio propuesto necesita una validación formal del cliente antes de su implementación en serie.

-   **Condición de Bloqueo en el ECO:** Cuando se genera un ECO a partir de un ECR que tiene marcada la opción "Requiere PPAP", aparece una nueva sección en el formulario del ECO: **"Confirmación de PPAP Requerida"**.

-   **Control Crítico:** Esta casilla de confirmación actúa como un **bloqueo de seguridad**. El sistema **no permitirá la aprobación final del ECO** hasta que un usuario responsable marque esta casilla. Esta acción representa una confirmación formal de que el proceso PPAP con el cliente ha sido completado y aprobado satisfactoriamente.

-   **Lógica de Activación:** El sistema muestra la sección de confirmación de PPAP en el ECO solo si se cumplen dos condiciones en el ECR original:
    1.  El campo **`cliente_aprobacion_estado`** está marcado como `aprobado`.
    2.  La casilla **`cliente_requiere_ppap`** está marcada como `true`.
    Esto asegura que el bloqueo de PPAP solo se active cuando el cliente ya ha dado su consentimiento inicial al cambio y se ha determinado que el método formal de documentación es un PPAP.

-   **Responsabilidad:** Generalmente, el departamento de **Calidad** o **Calidad Cliente** es el responsable de gestionar el proceso PPAP con el cliente y, por lo tanto, de marcar la casilla de confirmación en el ECO una vez obtenida la aprobación.

-   **Flujo Estándar:** Si un ECR no requiere PPAP, el ECO correspondiente no mostrará esta sección de confirmación y su flujo de aprobación procederá de manera estándar.

#### 6. Indicadores de Gestión de Cambios (ECM)

Para ofrecer una visión de alto nivel sobre la eficiencia del proceso, el sistema incluye un **Dashboard de Indicadores de Gestión de Cambios (ECM - Engineering Change Management)**. Este panel centraliza métricas y KPIs clave sobre los ECRs y ECOs, permitiendo a los gestores:

-   Visualizar el volumen de solicitudes de cambio a lo largo del tiempo.
-   Analizar los tiempos promedio de aprobación por departamento.
-   Identificar cuellos de botella en el flujo de trabajo.
-   Monitorear el estado general de todos los cambios en curso.

Este dashboard es una herramienta estratégica para la mejora continua del proceso de gestión de cambios de ingeniería.

## Panel de Administración del Dashboard

El dashboard incluye un panel de administración con herramientas potentes para gestionar el estado de la base de datos. Estas acciones son delicadas y deben usarse con precaución.

-   **Limpiar y Cargar Datos:** Esta es la acción de reinicio principal. Borra todas las colecciones de datos (productos, insumos, etc.) **excepto los usuarios** y luego carga el conjunto de datos de demostración. Es ideal para restaurar el entorno a un estado conocido.
-   **Borrar Solo Datos:** Una opción más segura que la anterior. Borra todas las colecciones de datos pero **deja intacta la colección de usuarios**. Útil para limpiar el entorno de trabajo sin afectar las cuentas existentes.
-   **Borrar Otros Usuarios:** Esta es una acción delicada. Elimina **únicamente** los documentos de la colección `usuarios`, preservando siempre al usuario administrador principal.

### Usuario Administrador Principal

Para facilitar las pruebas y la gestión, existe un usuario "Dios" con privilegios de administrador.

-   **Email:** `god@barackmercosul.com`
-   **Contraseña:** `123456`

## Entorno de Desarrollo y CLI

Esta sección contiene información técnica para desarrolladores sobre cómo interactuar con el backend de Firebase a través de la línea de comandos (CLI).

### Información del Proyecto

- **ID del Proyecto de Firebase:** `barackingenieria-e763c`

### Uso de Firebase CLI en Entornos No Interactivos

Para ejecutar comandos de Firebase CLI en un entorno no interactivo (como un servidor de integración continua o un entorno de desarrollo remoto como este), es necesario autenticarse usando una **cuenta de servicio (service account)**.

#### Pasos para la autenticación:

1.  **Generar una clave de cuenta de servicio:**
    *   Ve a la [consola de Google Cloud para las cuentas de servicio de tu proyecto](https://console.cloud.google.com/iam-admin/serviceaccounts?project=barackingenieria-e763c).
    *   Crea una nueva cuenta de servicio o usa una existente.
    *   Asegúrate de que la cuenta de servicio tenga los permisos necesarios. El rol de **"Editor" (Editor)** es una buena opción para tener permisos amplios.
    *   Genera una clave en formato **JSON** para la cuenta de servicio y descarga el archivo.

2.  **Configurar la variable de entorno:**
    *   Guarda el archivo JSON de la clave en un lugar seguro dentro del entorno.
    *   Establece la variable de entorno `GOOGLE_APPLICATION_CREDENTIALS` para que apunte a la ruta de tu archivo de clave JSON.
      ```bash
      export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/tu/serviceAccountKey.json"
      ```

Una vez configurada esta variable, Firebase CLI se autenticará automáticamente usando esta cuenta de servicio.

### Comandos Útiles

#### Borrar todas las colecciones de Firestore

Para borrar todas las colecciones y empezar desde cero, puedes usar el siguiente comando. **¡ADVERTENCIA! Esta acción es irreversible.**

```bash
# Primero, asegúrate de haber iniciado sesión o de haber configurado la cuenta de servicio
firebase firestore:delete --all-collections --force --project barackingenieria-e763c
```

#### Nota sobre la ejecución de Firebase CLI

En algunos entornos, el comando `firebase` puede no estar en el `PATH` del sistema, incluso después de instalar `firebase-tools` globalmente. Si esto ocurre, es necesario encontrar la ruta completa al ejecutable y usar `node` para invocarlo.

**Ejemplo de cómo encontrar y ejecutar el comando:**
1.  **Instalar `firebase-tools`:**
    ```bash
    npm install -g firebase-tools
    ```
2.  **Encontrar el directorio raíz de npm:**
    ```bash
    npm root -g
    ```
3.  **Construir y ejecutar la ruta completa:**
    ```bash
    # Ejemplo de ruta, puede variar en tu sistema
    node <npm_root_g_output>/firebase-tools/lib/bin/firebase.js <comando>
    ```

## Estructura del Proyecto

La aplicación sigue una estructura de archivos organizada para facilitar el mantenimiento y la escalabilidad. Los archivos principales se encuentran en el directorio `public/`.

### Módulo de Visualización 3D

Para la gestión de los recursos del visor 3D, se ha creado una estructura de carpetas específica dentro de `public/modulos/visor3d/`. Aunque algunas carpetas locales (`modelos/`, `imagenes/`) se mantienen para propósitos de fallback o desarrollo, la carga principal de modelos se realiza de forma dinámica.

#### Integración con Firebase Storage

El visor 3D ha sido actualizado para cargar los modelos dinámicamente desde **Firebase Storage**, en lugar de depender de los archivos locales. Esto permite una gestión de modelos más flexible y centralizada.

-   **Lógica de Carga:** Al iniciar, el visor se conecta a Firebase Storage y lista todos los archivos `.glb` disponibles en la carpeta `modelos3d/`.
-   **Botones Dinámicos:** Se crea un botón por cada modelo encontrado, permitiendo al usuario seleccionar cuál visualizar.
-   **Configuración:** La configuración de la conexión a Firebase se encuentra en `public/modulos/visor3d/js/visor3d.js`.
-   **Estructura de Almacenamiento:** Para que el visor los encuentre, los modelos 3D deben subirse a la raíz de una carpeta llamada `modelos3d/` en el bucket de Firebase Storage del proyecto. Las reglas de seguridad de Storage están configuradas para permitir el acceso público de solo lectura a esta carpeta específica.

La estructura de archivos local sirve como referencia:
-   **`js/`**: Contiene los archivos JavaScript principales del visor.
-   **`css/`**: Contiene las hojas de estilo específicas para el visor.

## Pruebas Automatizadas

Para garantizar la estabilidad y calidad del código, este proyecto utiliza un sistema de pruebas automatizadas con **Jest**. Estas pruebas verifican que las funciones clave del sistema operen como se espera y ayudan a prevenir errores (regresiones) cuando se introducen nuevas funcionalidades.

### Ejecutar las Pruebas

Para ejecutar el conjunto completo de pruebas, utilice el siguiente comando desde la raíz del proyecto:

```bash
npm test
```

Este comando buscará y ejecutará todos los archivos de prueba (con la extensión `.test.js`) y mostrará un resumen de los resultados en la consola. Es una buena práctica ejecutar las pruebas después de realizar cambios significativos en el código.

## A Note on AGENTS.md

You may notice a file named `AGENTS.md` in this repository. This file is specifically for providing instructions and guidelines to AI assistants (like Jules) who collaborate on this project. It contains technical conventions and lessons learned to make AI collaboration more efficient. For general project documentation, please continue to refer to this `README.md` file.
