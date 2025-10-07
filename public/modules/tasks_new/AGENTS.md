# Guía rápida para agentes en `tasks_new/`

- Utilizá `window.TasksAPI` para exponer nuevas capacidades hacia IA u otros módulos. No llames directamente a Firestore desde nuevas integraciones.
- No modifiques `public/modules/tasks/` ni otros archivos del planificador viejo salvo instrucción explícita.
- Respetá los checks de rol (`appState.currentUser.role`) y `previewRole` antes de permitir mutaciones.
- Mantené intactas las colecciones preservadas; las operaciones CRUD deben pasar por `tasks_service.js`.
- Conservá este módulo sincronizado con DayPilot Lite local (`public/vendor/daypilot/daypilot-all.min.js`). Si necesitás actualizarlo, consultá primero con el equipo humano.
