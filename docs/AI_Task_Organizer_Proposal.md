# Propuesta de Ampliación para el Organizador de Tareas con IA

Este documento describe una serie de mejoras propuestas para la funcionalidad de "Organizador de Tareas con IA", con el objetivo de automatizar aún más la creación y gestión de tareas.

## 1. Resumen de la Funcionalidad Actual

Actualmente, la IA analiza un texto libre ("braindump") proporcionado por el usuario y, a partir de él, genera automáticamente:
- Un **título** conciso para la tarea.
- Una **lista de subtareas** desglosadas.

## 2. Propuesta de Ampliación: "Poblado Inteligente de Campos"

La propuesta principal es extender la capacidad de la IA para que no solo genere el título y las subtareas, sino que también analice el texto para **sugerir y rellenar otros campos del formulario de tareas**.

### 2.1. Detección de Prioridad

La IA podría identificar palabras clave en el texto que indiquen la urgencia de la tarea.

- **Ejemplo de texto:** "Necesito **urgentemente** la presentación para el cliente para **hoy mismo**."
- **Acción de la IA:** Detecta la palabra "urgentemente" y establece la **Prioridad** del formulario en **"Alta"**.

### 2.2. Detección de Fecha Límite

La IA podría interpretar fechas y plazos mencionados en el texto y rellenar automáticamente el campo "Fecha Límite".

- **Ejemplo de texto:** "Coordinar una reunión de prueba con el equipo de ventas para el **próximo viernes**."
- **Acción de la IA:** Calcula la fecha del próximo viernes y la establece en el campo **Fecha Límite**. También podría entender formatos como "15 de julio", "en 3 días", "mañana", etc.

### 2.3. Sugerencia de Asignado

Si en el texto se menciona el nombre de un miembro del equipo, la IA podría sugerir asignarle la tarea.

- **Ejemplo de texto:** "Tengo que enviarle el reporte de rendimiento a **María García**."
- **Acción de la IA:** Busca en la lista de usuarios a "María García" y la preselecciona en el campo **Asignar a**.

## 3. Propuesta Adicional: Categorización y Vinculación Automática

### 3.1. Categorización de Tarea (Pública/Privada)

Basándose en el contenido, la IA podría sugerir si una tarea debe ser pública (visible para todo el equipo de Ingeniería) o privada.

- **Ejemplo de texto:** "Revisar la documentación del **proyecto Apolo** y actualizar los planos."
- **Acción de la IA:** Al detectar palabras clave como "proyecto", "planos", "ingeniería", etc., podría marcar por defecto la casilla **Tarea Pública**. Por el contrario, si el texto dice "Recordar llamar al dentista", la mantendría como privada.

### 3.2. Vinculación con Proyectos Existentes

Si la organización gestiona una lista de proyectos, la IA podría identificar el nombre de un proyecto en el texto y sugerir vincular la tarea a dicho proyecto.

- **Ejemplo de texto:** "Comprar los nuevos sensores para el **Proyecto Titán**."
- **Acción de la IA:** Identifica "Proyecto Titán" y lo selecciona en un (hipotético) campo "Proyecto" en el formulario de la tarea.

## 4. Beneficios de la Ampliación

- **Ahorro de Tiempo:** Reduce significativamente el tiempo manual de creación de tareas.
- **Reducción de Errores:** Minimiza la posibilidad de olvidar campos importantes como la fecha límite o la prioridad.
- **Consistencia:** Ayuda a mantener una nomenclatura y categorización de tareas más consistente en toda la plataforma.
- **Mejora de la Adopción:** Una herramienta más inteligente y automatizada es más atractiva y útil para los usuarios, incentivando su uso.

## 5. Próximos Pasos

Para implementar estas mejoras, se requeriría:
1.  **Actualizar el prompt** enviado a la API de Gemini para solicitar los nuevos campos en la respuesta JSON.
2.  **Modificar la Cloud Function** (`organizeTaskWithAI`) para procesar estos nuevos campos de la respuesta.
3.  **Ajustar el código del frontend** en `task.modal.js` para recibir los datos extendidos y rellenar los campos correspondientes del formulario (prioridad, fecha, asignado, etc.).
