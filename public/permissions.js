import { appState } from './state.js';

/**
 * Verifica los permisos de un usuario para realizar una acción específica.
 * @param {string} action - La acción a verificar (ej: 'create', 'edit', 'delete').
 * @param {object|string|null} item - El objeto sobre el que se actúa, un string para identificar el tipo (ej: 'tarea'), o null.
 * @returns {boolean} - `true` si el usuario tiene permiso, `false` en caso contrario.
 */
export function checkUserPermission(action, item = null) {
    if (!appState.currentUser) {
        return false; // Si no hay usuario, no hay permisos.
    }

    const { role, uid, isSuperAdmin } = appState.currentUser;
    const isImpersonating = appState.godModeState?.isImpersonating;

    // 1. SuperAdmins can do anything, UNLESS they are impersonating another role.
    if (isSuperAdmin && !isImpersonating) {
        return true;
    }

    const isTask = (typeof item === 'string' && item === 'tarea') || (item && typeof item === 'object' && 'creatorUid' in item);

    // 2. Specific logic for Tasks (applies to all roles)
    if (isTask) {
        if (action === 'create') {
            // Todos los roles pueden crear tareas.
            return true;
        }
        if ((action === 'edit' || action === 'delete') && typeof item === 'object' && item) {
            // Solo el creador o el asignado pueden editar o eliminar una tarea.
            return item.creatorUid === uid || item.assigneeUid === uid;
        }
    }

    // 3. Logic for the 'admin' role (non-super-admin)
    if (role === 'admin') {
        // Regular admins cannot perform destructive actions on general items.
        // Task deletion is handled above. User deletion is handled in `deleteItem`.
        if (action === 'delete') {
            return false;
        }
        return true; // Can do everything else.
    }

    // 4. Lógica para el rol 'lector'
    if (role === 'lector') {
        // Los lectores no pueden crear, editar o eliminar nada (excepto la creación de tareas ya manejada).
        if (['create', 'edit', 'delete'].includes(action)) {
            return false;
        }
    }

    // 5. Lógica para el rol 'editor'
    if (role === 'editor') {
        if (action === 'create') {
            return true; // Los editores pueden crear nuevos elementos.
        }
        if (action === 'delete') {
            return false; // Los editores no pueden eliminar elementos en general.
        }
        // Para 'edit', se asume que pueden editar (no hay una regla explícita en contra).
        // Se podría añadir más lógica aquí si fuera necesario.
    }

    // Por defecto, permitir otras acciones (como 'view') si no se ha denegado explícitamente.
    // O podrías devolver 'false' por defecto para una política más restrictiva.
    // En este caso, asumimos que si no se deniega, se permite.
    return true;
}
