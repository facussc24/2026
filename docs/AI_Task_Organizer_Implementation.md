# Documentación: Implementación del Organizador de Tareas con IA

Este documento detalla la arquitectura y los pasos de configuración para la funcionalidad "Organizador de Tareas con IA" en el módulo de tareas.

## 1. Arquitectura de la Solución

Para lograr una implementación segura y robusta, se eligió una arquitectura de 3 capas:

1.  **Frontend (Cliente)**: La interfaz de usuario dentro del modal de tareas. Contiene un campo de texto para que el usuario escriba sus ideas y un botón para iniciar el proceso. No contiene lógica de negocio sensible ni llaves de API.
2.  **Backend (Firebase Cloud Function)**: Actúa como un intermediario seguro. El frontend llama a una Cloud Function (`organizeTaskWithAI`) pasándole el texto del usuario.
3.  **Servicio de IA (Google Gemini API)**: La Cloud Function, desde el entorno seguro de Google, llama a la API de Google Gemini, pasándole el prompt y la llave de API (que obtiene de forma segura desde Secret Manager).

### ¿Por qué esta arquitectura?

*   **Seguridad:** La API Key de Gemini nunca se expone en el código del cliente (navegador). Está almacenada de forma segura en Google Secret Manager y solo la Cloud Function tiene acceso a ella.
*   **Robustez:** Se optó por una llamada directa a la API REST de Gemini usando `axios` en lugar de la librería `@google/genai`. Esto se hizo para resolver problemas de compatibilidad persistentes que la librería estaba causando en el entorno de Cloud Functions. La llamada directa es más explícita y menos propensa a fallar por problemas de dependencias.
*   **Control:** Centralizar la lógica en una Cloud Function nos permite modificar el prompt, el modelo de IA o incluso cambiar de proveedor de IA en el futuro sin necesidad de cambiar el código del frontend.

## 2. Guía de Configuración desde Cero

Para que esta funcionalidad opere en un nuevo entorno de Firebase, se deben seguir los siguientes pasos de configuración:

### Paso 1: Habilitar las APIs de Google Cloud

El proyecto de Google Cloud asociado a Firebase debe tener las siguientes APIs habilitadas:

*   **Cloud Functions API**: Para poder desplegar funciones.
*   **Artifact Registry API**: Para almacenar los builds de las funciones.
*   **Cloud Build API**: Para construir las funciones en la nube.
*   **Generative Language API**: La API de Gemini en sí.

**Acción:**
- Visita [este enlace](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=barackingenieria-e763c) (reemplazando `barackingenieria-e763c` con el ID del proyecto si es diferente) y asegúrate de que la API esté **HABILITADA**.

### Paso 2: Vincular una Cuenta de Facturación

Google requiere que un proyecto tenga una cuenta de facturación vinculada para poder usar sus APIs, incluso si solo se utiliza el nivel gratuito.

**Acción:**
- Visita [este enlace](https://console.cloud.google.com/billing?project=barackingenieria-e763c) (reemplazando el ID del proyecto si es necesario) y verifica que el proyecto esté vinculado a una cuenta de facturación activa.

### Paso 3: Obtener una API Key de Gemini

La Cloud Function necesita una llave para autenticarse con la API de Gemini.

**Acción:**
- Ve a **[Google AI Studio](https://aistudio.google.com/apikey)**.
- Inicia sesión y crea una API Key en un nuevo proyecto.
- Copia la llave generada.

### Paso 4: Guardar la API Key como un Secreto en Firebase

Para usar la llave de forma segura, se guarda en el "Secret Manager" de Firebase.

**Acción:**
- Desde la terminal, en la raíz de tu proyecto local, ejecuta el siguiente comando:
  ```bash
  firebase functions:secrets:set GEMINI_API_KEY
  ```
- Cuando la terminal te lo pida (`Enter a value for GEMINI_API_KEY`), pega la llave que copiaste en el paso anterior y presiona Enter.

### Paso 5: Instalar Dependencias y Desplegar

Finalmente, con toda la configuración lista, se deben instalar las dependencias y desplegar el proyecto.

**Acción:**
- **Instalar dependencias del frontend:**
  ```bash
  npm install
  ```
- **Instalar dependencias de las funciones:**
  ```bash
  cd functions
  npm install
  cd ..
  ```
- **Desplegar todo el proyecto (hosting y functions):**
  ```bash
  firebase deploy
  ```
  O, si solo quieres desplegar la función actualizada:
  ```bash
  firebase deploy --only functions
  ```

Siguiendo estos pasos, la funcionalidad del Organizador de Tareas con IA quedará 100% operativa.
