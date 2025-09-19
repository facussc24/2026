import { collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, or } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '/utils.js';
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

export async function saveTelegramConfig() {
    const chatId = document.getElementById('telegram-chat-id').value.trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
        showToast('Por favor, ingrese un Chat ID de Telegram válido (solo números).', 'error');
        return;
    }
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    try {
        await updateDoc(userDocRef, {
            telegramChatId: chatId,
            telegramNotifications: {
                onAssignment: document.getElementById('notify-on-assignment').checked,
                onStatusChange: document.getElementById('notify-on-status-change').checked,
                onDueDateReminder: document.getElementById('notify-on-due-date-reminder').checked
            }
        });
        showToast('Configuración de Telegram guardada.', 'success');
    } catch (error) {
        showToast('Error al guardar la configuración.', 'error');
    }
};

export async function sendTestTelegram(e) {
    const button = e.target.closest('button');
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
        startDate: form.querySelector('[name="startDate"]').value,
        dueDate: form.querySelector('[name="dueDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement.dataset.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

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

export function deleteTask(taskId) {
    return deleteDoc(doc(db, COLLECTIONS.TAREAS, taskId));
}

export function updateTaskStatus(taskId, newStatus) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { status: newStatus });
}

export function subscribeToAllTasks(callback, handleError) {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const q = query(tasksRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(allTasks);
    }, handleError);
    return unsubscribe;
}

export function subscribeToTasks(callback, handleError) {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const user = appState.currentUser;
    const state = getState();

    let queryConstraints = [];

    if (state.kanban.activeFilter === 'personal') {
        const assignedQuery = query(tasksRef, where('assigneeUid', '==', user.uid));
        const createdQuery = query(tasksRef, where('creatorUid', '==', user.uid));

        let assignedTasks = [];
        let createdTasks = [];

        const mergeAndCallback = () => {
            const allPersonalTasks = [...assignedTasks, ...createdTasks];
            const uniqueTasks = Array.from(new Map(allPersonalTasks.map(t => [t.docId, t])).values());
            callback(uniqueTasks);
        };

        const unsubAssigned = onSnapshot(assignedQuery, (snapshot) => {
            assignedTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            mergeAndCallback();
        }, handleError);

        const unsubCreated = onSnapshot(createdQuery, (snapshot) => {
            createdTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            mergeAndCallback();
        }, handleError);

        return [unsubAssigned, unsubCreated];
    } else {
        queryConstraints.push(orderBy('createdAt', 'desc'));

        if (state.kanban.selectedUserId) {
            queryConstraints.push(where('assigneeUid', '==', state.kanban.selectedUserId));
        } else if (state.kanban.activeFilter === 'engineering') {
            queryConstraints.push(where('isPublic', '==', true));
        } else if (state.kanban.activeFilter === 'all' && user.role !== 'admin') {
            queryConstraints.push(where('isPublic', '==', true));
        }
    }

    if (state.kanban.priorityFilter !== 'all') {
        queryConstraints.push(where('priority', '==', state.kanban.priorityFilter));
    }

    const finalQuery = query(tasksRef, ...queryConstraints);
    const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(tasks);
    }, handleError);

    return [unsubscribe];
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
