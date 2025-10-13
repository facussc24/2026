/**
 * Core task data services.
 *
 * Provides Firestore-backed helpers for CRUD operations, streaming updates,
 * and integrations (Telegram, Excel export) used across the task management
 * experience. The module relies on dependency injection so that the Firebase
 * instances are controlled by the application shell, easing testing and future
 * refactors.
 *
 * @module modules/tasks/task.service
 */

import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, limit, startAfter, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../../utils.js';
import { augmentTasksWithSchedule } from '../../utils/task-status.js';

// Dependencies to be injected
let db;
let functions;
let appState;
let showToast;
let lucide;

function convertDateInputToTimestamp(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Timestamp) {
        return value;
    }
    if (value instanceof Date) {
        const clone = new Date(value.getTime());
        clone.setHours(0, 0, 0, 0);
        return Timestamp.fromDate(clone);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            parsed.setHours(0, 0, 0, 0);
            return Timestamp.fromDate(parsed);
        }
    }
    if (value && typeof value.toDate === 'function') {
        const converted = value.toDate();
        if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
            converted.setHours(0, 0, 0, 0);
            return Timestamp.fromDate(converted);
        }
    }
    return null;
}

/**
 * Stores shared dependencies so the service functions can interact with
 * Firestore and the UI without coupling to global imports.
 *
 * @param {Object} dependencies - Firebase instances and UI callbacks.
 */
export function initTaskService(dependencies) {
    db = dependencies.db;
    functions = dependencies.functions;
    appState = dependencies.appState;
    showToast = dependencies.showToast;
    lucide = dependencies.lucide;
}

/**
 * Fetches every task document without pagination.
 *
 * @returns {Promise<Array<Object>>} List of serialized task documents.
 */
export async function fetchAllTasks() {
    const tasksQuery = query(collection(db, COLLECTIONS.TAREAS));
    const snapshot = await getDocs(tasksQuery);
    const tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
    return augmentTasksWithSchedule(tasks);
}

/**
 * Carga la configuración de Telegram del usuario actual desde Firestore y la muestra en el formulario.
 * @param {HTMLElement} container - El elemento contenedor del DOM que contiene el formulario de configuración de Telegram.
 */
export async function loadTelegramConfig(container) {
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        const userData = userDoc.data();
        const chatId = userData.telegramChatId || '';
        const notifications = userData.telegramNotifications || {};

        const chatIdInput = container.querySelector('#telegram-chat-id');
        const onAssignmentCheck = container.querySelector('#notify-on-assignment');
        const onStatusChangeCheck = container.querySelector('#notify-on-status-change');
        const onDueDateReminderCheck = container.querySelector('#notify-on-due-date-reminder');

        if(chatIdInput) chatIdInput.value = chatId;
        if(onAssignmentCheck) onAssignmentCheck.checked = !!notifications.onAssignment;
        if(onStatusChangeCheck) onStatusChangeCheck.checked = !!notifications.onStatusChange;
        if(onDueDateReminderCheck) onDueDateReminderCheck.checked = !!notifications.onDueDateReminder;
    }
}

/**
 * Guarda la configuración de Telegram del usuario (Chat ID y preferencias de notificación) en Firestore.
 * @param {HTMLElement} container - El elemento contenedor del DOM que contiene el formulario de configuración.
 */
export async function saveTelegramConfig(container) {
    const chatIdInput = container.querySelector('#telegram-chat-id');
    if (!chatIdInput) return;

    const chatId = chatIdInput.value.trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
        showToast('Por favor, ingrese un Chat ID de Telegram válido (solo números).', 'error');
        return;
    }
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    try {
        await updateDoc(userDocRef, {
            telegramChatId: chatId,
            telegramNotifications: {
                onAssignment: container.querySelector('#notify-on-assignment').checked,
                onStatusChange: container.querySelector('#notify-on-status-change').checked,
                onDueDateReminder: container.querySelector('#notify-on-due-date-reminder').checked
            }
        });
        showToast('Configuración de Telegram guardada.', 'success');
    } catch (error) {
        showToast('Error al guardar la configuración.', 'error');
    }
};

/**
 * Llama a una función de Firebase para enviar un mensaje de prueba de Telegram al Chat ID configurado por el usuario.
 * @param {HTMLElement} container - El elemento contenedor del DOM que contiene el botón de prueba.
 */
export async function sendTestTelegram(container) {
    const button = container.querySelector('#send-test-telegram-btn');
    if(!button) return;

    const originalText = button.innerHTML;
    button.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5 mr-2"></i>Enviando...';
    button.disabled = true;
    lucide.createIcons();
    try {
        const sendTestMessage = httpsCallable(functions, 'sendTestTelegramMessage');
        const result = await sendTestMessage();
        showToast(result.data.message, 'success');
    } catch (error) {
        showToast(`Error: ${error.message || "Error desconocido."}`, 'error');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
};

/**
 * Handles the submission of the task modal form, delegating to Firestore for
 * document creation or updates and synchronizing the cached modal state.
 *
 * @param {SubmitEvent} e - Form submit event from the task modal.
 */
export async function handleTaskFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const taskId = form.querySelector('[name="taskId"]').value;
    const isEditing = !!taskId;

    const modalElement = form.closest('#task-form-modal');
    const data = {
        title: form.querySelector('[name="title"]').value,
        description: form.querySelector('[name="description"]').value,
        assigneeUid: form.querySelector('[name="assigneeUid"]').value,
        priority: form.querySelector('[name="priority"]').value,
        effort: form.querySelector('[name="effort"]').value,
        startDate: form.querySelector('[name="startDate"]').value,
        dueDate: form.querySelector('[name="dueDate"]').value,
        endDate: form.querySelector('[name="endDate"]').value,
        progress: form.querySelector('[name="progress"]').value,
        plannedDate: form.querySelector('[name="plannedDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement.dataset.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

    ['startDate', 'dueDate', 'endDate'].forEach(field => {
        data[field] = convertDateInputToTimestamp(data[field]);
    });

    // Create unified search keywords
    const titleKeywords = data.title.toLowerCase().split(' ').filter(w => w.length > 2);
    let tags = [];
    let existingTaskData = null;
    if (isEditing) {
        try {
            const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
            const taskDoc = await getDoc(taskRef);
            if (taskDoc.exists()) {
                existingTaskData = taskDoc.data();
                tags = existingTaskData.tags || [];
            }
        } catch (e) {
            console.error("Could not fetch existing task to preserve tags:", e);
        }
    }
    data.search_keywords = [...new Set([...titleKeywords, ...tags])];


    const isPublicCheckbox = form.querySelector('[name="isPublic"]');
    if (isPublicCheckbox) {
        data.isPublic = isPublicCheckbox.checked;
    } else if (!isEditing) {
        data.isPublic = false;
    }

    // Explicitly handle the 'isProjectTask' checkbox.
    // Unchecked checkboxes are not included in form data, so we must handle the false case.
    const isProjectTaskCheckbox = form.querySelector('[name="isProjectTask"]');
    data.isProjectTask = !!isProjectTaskCheckbox?.checked;

    const saveButton = modalElement.querySelector('button[type="submit"]');
    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
    lucide.createIcons();

    let success = false;
    try {
        if (isEditing) {
            const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
            await updateDoc(taskRef, data);
            showToast('Tarea actualizada con éxito.', 'success');
        } else {
            data.creatorUid = appState.currentUser.uid;
            data.createdAt = new Date();
            data.status = form.querySelector('[name="status"]').value || 'todo';
            await addDoc(collection(db, COLLECTIONS.TAREAS), data);
            showToast('Tarea creada con éxito.', 'success');
        }
        success = true;
        // Use the already-found modalElement reference and add a null check for safety.
        if (modalElement) {
            modalElement.remove();
        }
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Error al guardar la tarea.', 'error');
    } finally {
        if (!success) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonHTML;
        }
    }
}

/**
 * Persists a new task document.
 *
 * @param {Object} taskData - Task payload collected from the UI.
 * @returns {Promise<boolean>} Indicates whether the operation succeeded.
 */
export async function createTask(taskData) {
    const data = {
        ...taskData,
        creatorUid: appState.currentUser.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'todo' // Default status for new tasks
    };

    if (typeof data.showInPlanning === 'undefined') {
        data.showInPlanning = false;
    } else {
        data.showInPlanning = !!data.showInPlanning;
    }

    ['startDate', 'dueDate', 'endDate'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
            data[field] = convertDateInputToTimestamp(data[field]);
        }
    });

    // Create unified search keywords
    const titleKeywords = data.title.toLowerCase().split(' ').filter(w => w.length > 2);
    const tags = data.tags || [];
    data.search_keywords = [...new Set([...titleKeywords, ...tags])];

    try {
        await addDoc(collection(db, COLLECTIONS.TAREAS), data);
        return true; // Indicate success
    } catch (error) {
        console.error('Error creating task:', error);
        showToast('Error al crear una de las tareas.', 'error');
        return false; // Indicate failure
    }
}

/**
 * Deletes a task document by ID.
 *
 * @param {string} taskId - Firestore document ID for the task.
 * @returns {Promise<void>}
 */
export function deleteTask(taskId) {
    return deleteDoc(doc(db, COLLECTIONS.TAREAS, taskId));
}

/**
 * Updates a task's status field, maintaining audit metadata.
 *
 * @param {string} taskId - Identifier of the task to update.
 * @param {string} newStatus - New status (todo, inprogress, done).
 * @returns {Promise<void>}
 */
export function updateTaskStatus(taskId, newStatus) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { status: newStatus });
}

/**
 * Marks a task as completed and records archival metadata.
 *
 * @param {string} taskId - Identifier of the task to archive.
 * @returns {Promise<void>}
 */
export async function completeAndArchiveTask(taskId) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    await updateDoc(taskRef, {
        status: 'done',
        isArchived: true,
        completedAt: new Date()
    });
}

/**
 * Flags or unflags a task as blocked.
 *
 * @param {string} taskId - Identifier of the task to update.
 * @param {boolean} isBlocked - Whether the task should be considered blocked.
 * @returns {Promise<void>}
 */
export function updateTaskBlockedStatus(taskId, isBlocked) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { blocked: isBlocked });
}

/**
 * Registers a real-time listener for all tasks ordered by creation date.
 *
 * @param {Function} callback - Invoked with serialized task records on update.
 * @param {Function} [handleError] - Optional listener error handler.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToAllTasks(callback, handleError) {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    // Always order by creation date descending for consistency.
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(augmentTasksWithSchedule(allTasks));
    }, handleError);
    return unsubscribe;
}

/**
 * Streams paginated task batches that honor filtering options.
 *
 * @param {Object} filters - Filter options (searchTerm, user, status, priority).
 * @param {Object} pagination - Pagination state (lastVisible, pageSize).
 * @param {Function} callback - Receives task batch updates.
 * @param {Function} handleError - Error handler for snapshot failures.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToPaginatedTasks(filters, pagination, callback, handleError) {
    const { searchTerm, user, status, priority } = filters;
    const { lastVisible, pageSize = 10 } = pagination;

    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    let queryConstraints = [orderBy('createdAt', 'desc')];

    if (user && user !== 'all') {
        queryConstraints.push(where('assigneeUid', '==', user));
    }
    if (status && status !== 'all') {
        queryConstraints.push(where('status', '==', status));
    }
    if (priority && priority !== 'all') {
        queryConstraints.push(where('priority', '==', priority));
    }

    const lowercasedFilter = searchTerm ? searchTerm.toLowerCase().trim() : '';
    if (lowercasedFilter) {
        queryConstraints.push(where('search_keywords', 'array-contains', lowercasedFilter));
    }

    if (lastVisible) {
        queryConstraints.push(startAfter(lastVisible));
    }
    queryConstraints.push(limit(pageSize));

    const q = query(tasksRef, ...queryConstraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const tasks = augmentTasksWithSchedule(snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id })));
        const newLastVisible = snapshot.docs[snapshot.docs.length - 1];

        callback({
            tasks: tasks,
            lastVisible: newLastVisible,
            isLastPage: snapshot.docs.length < pageSize
        });
    }, (error) => {
        console.error("Error in subscribeToPaginatedTasks:", error);
        if (error.code === 'failed-precondition') {
            const indexLink = error.message.match(/(https?:\/\/[^\s]+)/);
            if (indexLink) {
                console.error(`Missing Firestore index. Please create it by visiting this link: ${indexLink[0]}`);
                showToast('Se requiere un índice de base de datos. Consulte la consola para obtener el enlace para crearlo.', 'error', 10000);
            }
        }
        handleError(error);
    });

    return unsubscribe;
}


/**
 * Calculates how many tasks are overdue relative to today.
 *
 * @param {Array<Object>} tasks - Task list to evaluate.
 * @returns {number} Overdue task count.
 */
export function calculateOverdueTasksCount(tasks) {
    if (!tasks || !Array.isArray(tasks)) {
        return 0;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to the beginning of the day for accurate comparison

    return tasks.filter(task => {
        if (task.status === 'done' || !task.dueDate) {
            return false;
        }
        const dueDate = new Date(task.dueDate + "T00:00:00"); // Ensure correct date parsing
        return dueDate < today;
    }).length;
}

/**
 * Fetches all tasks, formats them into a user-friendly structure, and exports
 * them to an Excel file with styled headers and consistent column widths.
 *
 * @returns {Promise<void>} Resolves once the workbook has been generated.
 */
export async function exportTasksToExcel() {
    showToast('Generando reporte de tareas...', 'info');

    try {
        const tasks = await fetchAllTasks();
        const users = appState.collectionsById.usuarios || new Map();

        const statusMap = {
            todo: 'Por Hacer',
            inprogress: 'En Progreso',
            done: 'Completada'
        };

        const priorityMap = {
            low: 'Baja',
            medium: 'Media',
            high: 'Alta'
        };

        const tasksToExport = tasks.map(task => {
            const assignee = users.get(task.assigneeUid);
            const creator = users.get(task.creatorUid);
            const formatDate = (dateString) => {
                if (!dateString) return '';
                // Add T00:00:00 to ensure date is parsed in local time zone, not UTC
                return new Date(dateString + "T00:00:00").toLocaleDateString('es-AR');
            };

            return {
                'ID Tarea': task.docId,
                'Título': task.title,
                'Descripción': task.description,
                'Estado': statusMap[task.status] || task.status,
                'Prioridad': priorityMap[task.priority] || task.priority,
                'Fecha de Creación': task.createdAt?.toDate ? task.createdAt.toDate().toLocaleDateString('es-AR') : '',
                'Fecha de Inicio': formatDate(task.startDate),
                'Fecha Límite': formatDate(task.dueDate),
                'Asignada a': assignee ? assignee.name : 'No asignado',
                'Creada por': creator ? creator.name : 'Desconocido',
                'Es Pública': task.isPublic ? 'Sí' : 'No'
            };
        });

        if (tasksToExport.length === 0) {
            showToast('No hay tareas para exportar.', 'info');
            return;
        }

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(tasksToExport);

        // Define column widths
        const columnWidths = [
            { wch: 15 }, // ID Tarea
            { wch: 40 }, // Título
            { wch: 60 }, // Descripción
            { wch: 15 }, // Estado
            { wch: 12 }, // Prioridad
            { wch: 18 }, // Fecha de Creación
            { wch: 18 }, // Fecha de Inicio
            { wch: 18 }, // Fecha Límite
            { wch: 25 }, // Asignada a
            { wch: 25 }, // Creada por
            { wch: 12 }  // Es Pública
        ];
        ws['!cols'] = columnWidths;

        // Style header row
        const headerStyle = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center", vertical: "center" }
        };

        // Get the range of the header
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        // Create workbook and export
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
        XLSX.writeFile(wb, 'Reporte_de_Tareas.xlsx');

        showToast('Reporte de tareas exportado con éxito.', 'success');

    } catch (error) {
        console.error("Error exporting tasks to Excel:", error);
        showToast('Error al exportar las tareas.', 'error');
    }
}
