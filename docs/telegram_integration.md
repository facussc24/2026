# Integración con Telegram

Este documento explica cómo conectar tu cuenta de la aplicación con un bot de Telegram para recibir notificaciones de tareas y cómo funciona el sistema de alertas.

## ¿Cómo Conectar tu Cuenta?

Para recibir notificaciones, la aplicación necesita saber cuál es tu "Chat ID" de Telegram. Este es un identificador único para tu conversación con el bot.

1.  **Abre Telegram** en tu teléfono o computadora.
2.  Busca el bot llamado **`@userinfobot`**.
3.  Inicia una conversación con él. Puedes simplemente enviarle el comando `/start`.
4.  El bot te responderá inmediatamente con tu información de usuario. El número que aparece como **"Id"** es tu Chat ID.
5.  Copia este número.
6.  En la aplicación, ve a la sección de **Tareas**.
7.  Despliega la sección de **"Configuración de Notificaciones de Telegram"**.
8.  Pega el número que copiaste en el campo **"Tu Chat ID de Telegram"**.
9.  Haz clic en **"Guardar Configuración"**.

¡Listo! Para verificar que todo funciona, puedes usar el botón "Enviar Mensaje de Prueba".

## ¿Qué Notificaciones Recibiré?

Puedes personalizar qué notificaciones quieres recibir. Las alertas se activan en los siguientes casos:

-   **Nueva Tarea Asignada:** Recibirás un mensaje instantáneo cuando otro usuario te asigne una nueva tarea.
-   **Cambio de Estado de Tarea Creada:** Si una tarea que **tú creaste** es movida a otro estado (por ejemplo, de "Por Hacer" a "En Progreso") por la persona asignada, recibirás una notificación.
-   **Recordatorio de Vencimiento:** Recibirás un recordatorio **un día antes** de la fecha de vencimiento de una tarea que tengas asignada.

Puedes activar o desactivar cada uno de estos tipos de notificación desde el panel de configuración de Telegram en la aplicación.
