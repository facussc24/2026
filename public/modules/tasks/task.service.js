import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, or, and, limit, startAfter, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../../utils.js';
import { getState } from './task.state.js';

// Dependencies to be injected
let db;
let functions;
let appState;
let showToast;
let lucide;

export function initTaskService(dependencies) {
    db = dependencies.db;
    functions = dependencies.functions;
    appState = dependencies.appState;
    showToast = dependencies.showToast;
    lucide = dependencies.lucide;
}

export async function fetchAllTasks() {
    const tasksQuery = query(collection(db, COLLECTIONS.TAREAS));
    const snapshot = await getDocs(tasksQuery);
    return snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
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
        plannedDate: form.querySelector('[name="plannedDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement.dataset.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

    // Create unified search keywords
    const titleKeywords = data.title.toLowerCase().split(' ').filter(w => w.length > 2);
    let tags = [];
    if (isEditing) {
        try {
            const taskDoc = await getDoc(doc(db, COLLECTIONS.TAREAS, taskId));
            if (taskDoc.exists()) {
                tags = taskDoc.data().tags || [];
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
        data.isPublic = getState().kanban.activeFilter === 'engineering';
    }

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
        document.getElementById('task-form-modal').remove();
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

export async function createTask(taskData) {
    const data = {
        ...taskData,
        creatorUid: appState.currentUser.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'todo' // Default status for new tasks
    };

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

export function deleteTask(taskId) {
    return deleteDoc(doc(db, COLLECTIONS.TAREAS, taskId));
}

export function updateTaskStatus(taskId, newStatus) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { status: newStatus });
}

export async function completeAndArchiveTask(taskId) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    await updateDoc(taskRef, {
        status: 'done',
        isArchived: true,
        completedAt: new Date()
    });
}

export function updateTaskBlockedStatus(taskId, isBlocked) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { blocked: isBlocked });
}

export function subscribeToAllTasks(callback, handleError) {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    // Always order by creation date descending for consistency.
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(allTasks);
    }, handleError);
    return unsubscribe;
}

export function subscribeToTasks(callback, handleError) {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const user = appState.currentUser;
    const { activeFilter, selectedUserId, priorityFilter, searchTerm } = getState().kanban;

    let conditions = [];

    // User and Role-based filtering
    if (user.role !== 'admin') {
        // Non-admins only see tasks assigned to them.
        conditions.push(where('assigneeUid', '==', user.uid));
    } else {
        // Admin filtering logic
        switch (activeFilter) {
            case 'personal':
                conditions.push(or(
                    where('assigneeUid', '==', user.uid),
                    where('creatorUid', '==', user.uid)
                ));
                break;
            case 'supervision':
                if (selectedUserId) {
                    conditions.push(where('assigneeUid', '==', selectedUserId));
                }
                // If no user is selected in supervision, it shows a user list, not tasks.
                // An empty condition array here is correct.
                break;
            case 'engineering':
                conditions.push(where('isPublic', '==', true));
                break;
            // For 'all', no specific user/role filter is added.
        }
    }

    // Priority filtering
    if (priorityFilter !== 'all') {
        conditions.push(where('priority', '==', priorityFilter));
    }

    // Search term filtering
    const trimmedSearch = searchTerm.toLowerCase().trim();
    if (trimmedSearch) {
        conditions.push(where('search_keywords', 'array-contains', trimmedSearch));
    }

    // Build the final query
    const queryConstraints = [];
    if (conditions.length > 0) {
        // Use 'and()' to combine all filter conditions.
        // Firestore requires that 'or()' queries are not mixed with other 'where' clauses in the same 'and()'.
        // The current logic correctly separates the 'or' for the 'personal' filter, so this is safe.
        queryConstraints.push(and(...conditions));
    }
    queryConstraints.push(orderBy('createdAt', 'desc'));

    const finalQuery = query(tasksRef, ...queryConstraints);

    const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(tasks);
    }, (error) => {
        console.error("Error in subscribeToTasks:", error);
        if (error.code === 'failed-precondition') {
            console.error("This error likely means you're missing a Firestore index. Check the browser's developer console for a link to create it automatically.");
            showToast('Se requiere un índice de base de datos para este filtro. Revisa la consola.', 'error');
        }
        handleError(error);
    });

    return [unsubscribe];
}

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
        const tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
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
 * Fetches all tasks, formats them into a user-friendly structure, and exports them to an Excel file.
 * The exported file will have formatted headers and adjusted column widths.
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
