# Informe de pruebas de aceptación – Aplicación web Barack Ingeniería

## Resumen ejecutivo
- **Fecha de evaluación:** _(actualizar según corresponda)_
- **Evaluador:** Equipo de QA externo
- **Entorno probado:** Producción Firebase – https://barackingenieria-e763c.web.app/
- **Resultado general:** Fallido. Las incidencias detectadas impiden a un usuario autenticarse o utilizar funcionalidades centrales.

## Hallazgos críticos
| Área / flujo | Severidad | Descripción | Evidencia |
| --- | --- | --- | --- |
| Configuración de Firebase | Alta | El acceso a `/` muestra la página por defecto de Firebase (“Page Not Found”), lo que indica una mala configuración de la carpeta `public` o la ausencia de reglas `rewrites` para SPA en `firebase.json`. | Captura: pantalla inicial de Firebase con mensaje “Page Not Found”. |
| Inicio de sesión | Alta | a) Al enviar credenciales incorrectas el botón queda en estado de carga indefinidamente sin retroalimentación.<br>b) El enlace “¿Olvidaste tu contraseña?” dirige a una ruta inexistente y vuelve a mostrar la página de error de Firebase. | Captura: spinner permanente tras credenciales inválidas. Captura: página “Page Not Found” al pulsar recuperación. |
| Registro de usuario | Alta | El campo de correo está configurado como `type="password"`; los caracteres quedan ocultos y el formulario no se envía. Solo acepta dominios corporativos pero no informa el motivo del rechazo. | Captura: campo de correo con bullets y aviso del navegador “Please fill out this field”. |
| Navegación interna | Media | Acceder directamente a rutas protegidas (ej. `/dashboard`) redirige a la pantalla de registro, indicando que los guards de autenticación no están controlando el flujo correctamente. | Captura: redirección a pantalla de registro desde `/dashboard`. |

## Recomendaciones
### 1. Configuración de hosting en Firebase
- Validar que el campo `public` en `firebase.json` apunte al directorio que contiene el build (por ejemplo, `dist/` o `build/`).
- Añadir una regla de reescritura (`"rewrites": [{ "source": "**", "destination": "/index.html" }]`) para garantizar el correcto funcionamiento de la SPA en rutas profundas.

### 2. Manejo de errores en autenticación
- Implementar manejo explícito de errores para respuestas de Firebase Auth (usuario inexistente, contraseña inválida).
- Restablecer el estado del botón y mostrar mensajes claros al usuario (“Credenciales incorrectas”).
- Añadir un temporizador de seguridad para evitar spinners perpetuos en caso de latencia o errores de red.

### 3. Recuperación de contraseña
- Implementar una vista accesible (ej. `/reset-password`) con formulario para solicitar correo de recuperación.
- Actualizar el enlace “¿Olvidaste tu contraseña?” hacia la nueva ruta o deshabilitarlo hasta que exista la funcionalidad.

### 4. Formulario de registro
- Ajustar el input de correo a `type="email"` para aprovechar validación y visibilidad nativa.
- Incluir mensajes específicos cuando el dominio no pertenezca al permitido.
- Agregar un botón de envío claramente visible y, si procede, campos adicionales (nombre, contraseña) con validaciones coherentes.

### 5. Flujo de navegación y guards
- Configurar guards que redirijan a `/login` cuando un usuario no autenticado intente acceder a vistas privadas.
- Garantizar que `/dashboard` u otras rutas privadas no regresen a la pantalla de registro salvo que sea el flujo deseado.

## Conclusión
La aplicación no puede considerarse lista para usuarios finales. Antes de continuar con pruebas funcionales avanzadas se recomienda:
1. Corregir la configuración de hosting para servir la SPA correctamente.
2. Revisar y robustecer los flujos de autenticación (inicio de sesión, recuperación y registro).
3. Implementar feedback de errores y guardas de navegación que protejan las rutas privadas.

Una vez abordados estos puntos críticos, se podrá avanzar con pruebas adicionales sobre las funcionalidades de negocio.
