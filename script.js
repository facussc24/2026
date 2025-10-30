// Data Storage
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let documents = JSON.parse(localStorage.getItem('documents')) || [];
let taskFilter = 'all';
let documentFilter = 'all';
let taskSearchQuery = '';
let idCounter = 0;
let currentTaskView = 'list'; // 'list' or 'kanban'

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    createToastContainer();
    renderTasks();
    renderDocuments();
    renderDashboard();
});

// Toast Notification System
function createToastContainer() {
    if (!document.querySelector('.toast-container')) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

function showToast(title, message, type = 'info') {
    const container = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <div class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close" onclick="closeToast(this)" aria-label="Cerrar notificación">×</button>
    `;
    
    container.appendChild(toast);
    
    // Announce to screen readers
    announceToScreenReader(`${title}. ${message || ''}`);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        closeToast(toast.querySelector('.toast-close'));
    }, 4000);
}

function closeToast(button) {
    const toast = button.closest('.toast');
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
}

// Screen reader announcement helper
function announceToScreenReader(message) {
    const announcer = document.getElementById('sr-announcements');
    if (announcer) {
        announcer.textContent = message;
        // Clear after announcement
        setTimeout(() => {
            announcer.textContent = '';
        }, 1000);
    }
}

// Task Status Calculation
function getTaskStatus(task) {
    if (task.completed) return 'completed';
    if (!task.dueDate) return 'no-date';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3) return 'due-soon';
    return 'on-track';
}

function getTaskStatusBadge(task) {
    const status = getTaskStatus(task);
    const badges = {
        'overdue': { text: 'Vencida', icon: '🔴' },
        'due-soon': { text: 'Próxima a vencer', icon: '🟡' },
        'on-track': { text: 'En tiempo', icon: '🟢' },
        'completed': { text: 'Completada', icon: '✓' },
        'no-date': { text: 'Sin fecha', icon: '⚪' }
    };
    
    const badge = badges[status] || badges['no-date'];
    return `<span class="status-badge ${status}">${badge.icon} ${badge.text}</span>`;
}

function getDaysUntilDue(task) {
    if (!task.dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Module Navigation
function showModule(moduleId) {
    // Hide all modules
    document.querySelectorAll('.module-content').forEach(module => {
        module.classList.remove('active');
    });
    
    // Show selected module
    document.getElementById('module-' + moduleId).classList.add('active');
    
    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

// Task Management Functions
function showAddTaskForm() {
    document.getElementById('add-task-form').style.display = 'block';
}

function hideAddTaskForm() {
    document.getElementById('add-task-form').style.display = 'none';
    document.getElementById('add-task-form').querySelector('form').reset();
}

function addTask(event) {
    event.preventDefault();
    
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-description').value;
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-due-date').value;
    const assignee = document.getElementById('task-assignee').value;
    const tagsInput = document.getElementById('task-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    
    const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        description: description,
        priority: priority,
        dueDate: dueDate,
        assignee: assignee,
        tags: tags,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    saveTasks();
    renderTasks();
    hideAddTaskForm();
    showToast('¡Tarea creada!', `"${title}" se ha agregado exitosamente`, 'success');
}

function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks();
        renderTasks();
        showToast('Tarea eliminada', `"${task.title}" ha sido eliminada`, 'info');
    }
}

function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date().toISOString() : null;
        saveTasks();
        renderTasks();
        if (task.completed) {
            showToast('¡Tarea completada!', `"${task.title}" marcada como completada`, 'success');
        } else {
            showToast('Tarea reactivada', `"${task.title}" marcada como pendiente`, 'info');
        }
    }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Show form with task data
    showAddTaskForm();
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-due-date').value = task.dueDate;
    document.getElementById('task-assignee').value = task.assignee || '';
    document.getElementById('task-tags').value = task.tags ? task.tags.join(', ') : '';
    
    // Change form submit to update instead of add
    const form = document.getElementById('add-task-form').querySelector('form');
    form.onsubmit = function(event) {
        event.preventDefault();
        
        task.title = document.getElementById('task-title').value;
        task.description = document.getElementById('task-description').value;
        task.priority = document.getElementById('task-priority').value;
        task.dueDate = document.getElementById('task-due-date').value;
        task.assignee = document.getElementById('task-assignee').value;
        const tagsInput = document.getElementById('task-tags').value;
        task.tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        
        saveTasks();
        renderTasks();
        hideAddTaskForm();
        showToast('Tarea actualizada', `"${task.title}" se ha actualizado correctamente`, 'success');
        
        // Reset form submit to addTask
        form.onsubmit = addTask;
    };
}

// Debounced search for better performance
let searchTimeout;
function searchTasks() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        taskSearchQuery = document.getElementById('task-search').value.toLowerCase();
        renderTasks();
    }, 300); // Wait 300ms after user stops typing
}

function filterTasks(filter) {
    taskFilter = filter;
    
    // Update filter buttons
    const filterButtons = document.querySelectorAll('#tasks-section .filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        // Check button text to match filter
        const buttonText = btn.textContent.trim().toLowerCase();
        if ((filter === 'all' && buttonText === 'todas') ||
            (filter === 'pending' && buttonText === 'pendientes') ||
            (filter === 'completed' && buttonText === 'completadas')) {
            btn.classList.add('active');
        }
    });
    
    renderTasks();
}

function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    
    let filteredTasks = tasks;
    
    // Apply status filter
    if (taskFilter === 'pending') {
        filteredTasks = tasks.filter(task => !task.completed);
    } else if (taskFilter === 'completed') {
        filteredTasks = tasks.filter(task => task.completed);
    }
    
    // Apply search filter
    if (taskSearchQuery) {
        filteredTasks = filteredTasks.filter(task => {
            const searchIn = [
                task.title,
                task.description,
                task.assignee,
                ...(task.tags || [])
            ].join(' ').toLowerCase();
            return searchIn.includes(taskSearchQuery);
        });
    }
    
    if (filteredTasks.length === 0) {
        tasksList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h3>No hay tareas</h3>
                <p>Agrega una nueva tarea para comenzar</p>
            </div>
        `;
        return;
    }
    
    tasksList.innerHTML = filteredTasks.map(task => {
        const status = getTaskStatus(task);
        const daysUntil = getDaysUntilDue(task);
        
        return `
        <div class="task-item ${task.completed ? 'completed' : ''} status-${status}">
            <div class="task-status-indicator"></div>
            <div class="task-header">
                <div class="task-title-section">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="task-badge badge-${task.priority}">${task.priority.toUpperCase()}</span>
                        ${!task.completed && task.dueDate ? getTaskStatusBadge(task) : ''}
                        ${task.assignee ? `<span class="task-assignee">👤 ${escapeHtml(task.assignee)}</span>` : ''}
                    </div>
                </div>
            </div>
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            ${task.tags && task.tags.length > 0 ? `
                <div class="task-tags">
                    ${task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="task-footer">
                <div class="task-info-items">
                    ${task.dueDate ? `
                        <div class="task-info-item">
                            📅 ${formatDate(task.dueDate)}
                            ${daysUntil !== null && !task.completed ? 
                                `<span style="color: var(--text-secondary);">(${daysUntil === 0 ? 'Hoy' : daysUntil > 0 ? `en ${daysUntil}d` : `hace ${Math.abs(daysUntil)}d`})</span>` 
                                : ''}
                        </div>
                    ` : '<div class="task-info-item">📅 Sin fecha</div>'}
                    <div class="task-info-item">
                        🕐 Creada ${formatRelativeTime(task.createdAt)}
                    </div>
                    ${task.completedAt ? `
                        <div class="task-info-item">
                            ✓ Completada ${formatRelativeTime(task.completedAt)}
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="task-actions">
                <label class="checkbox-label">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete(${task.id})">
                    ${task.completed ? 'Completada' : 'Marcar como completada'}
                </label>
                <button class="btn btn-edit" onclick="editTask(${task.id})">✏️ Editar</button>
                <button class="btn btn-danger" onclick="deleteTask(${task.id})">🗑️ Eliminar</button>
            </div>
        </div>
    `;
    }).join('');
}

function saveTasks() {
    try {
        localStorage.setItem('tasks', JSON.stringify(tasks));
        // Update dashboard if it exists
        if (document.getElementById('stat-total-tasks')) {
            renderDashboard();
        }
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('Error de almacenamiento', 'Espacio lleno. Elimina datos antiguos.', 'error');
        } else if (e.name === 'SecurityError') {
            showToast('Error', 'Almacenamiento no disponible en modo privado', 'error');
        } else {
            showToast('Error', 'No se pudieron guardar los cambios', 'error');
        }
        console.error('localStorage error:', e);
    }
}

// View Switching
function switchTaskView(view) {
    currentTaskView = view;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide views
    const listView = document.getElementById('tasks-list');
    const kanbanView = document.getElementById('kanban-board');
    const searchFilters = document.querySelector('.search-filters');
    
    if (view === 'list') {
        listView.style.display = 'block';
        kanbanView.style.display = 'none';
        if (searchFilters) searchFilters.style.display = 'block';
        renderTasks();
    } else if (view === 'kanban') {
        listView.style.display = 'none';
        kanbanView.style.display = 'grid';
        if (searchFilters) searchFilters.style.display = 'none';
        renderKanban();
    }
}

// Kanban Functions
function renderKanban() {
    // Initialize task status if not set
    tasks.forEach(task => {
        if (!task.kanbanStatus) {
            task.kanbanStatus = task.completed ? 'done' : 'todo';
        }
    });
    
    const columns = {
        'todo': document.getElementById('kanban-todo'),
        'progress': document.getElementById('kanban-progress'),
        'review': document.getElementById('kanban-review'),
        'done': document.getElementById('kanban-done')
    };
    
    // Clear all columns
    Object.values(columns).forEach(col => {
        if (col) col.innerHTML = '';
    });
    
    // Count tasks per column
    const counts = {
        'todo': 0,
        'progress': 0,
        'review': 0,
        'done': 0
    };
    
    // Render tasks in their respective columns
    tasks.forEach(task => {
        const status = task.kanbanStatus || 'todo';
        counts[status]++;
        
        const column = columns[status];
        if (!column) return;
        
        const taskStatus = getTaskStatus(task);
        const card = document.createElement('div');
        card.className = `kanban-card status-${taskStatus}`;
        card.draggable = true;
        card.dataset.taskId = task.id;
        
        card.innerHTML = `
            <div class="kanban-card-title">${escapeHtml(task.title)}</div>
            <div class="kanban-card-meta">
                <span class="task-badge badge-${task.priority}">${task.priority.toUpperCase()}</span>
                ${task.assignee ? `<span class="task-assignee">👤 ${escapeHtml(task.assignee)}</span>` : ''}
                ${task.dueDate && !task.completed ? getTaskStatusBadge(task) : ''}
            </div>
            ${task.tags && task.tags.length > 0 ? `
                <div class="task-tags">
                    ${task.tags.slice(0, 3).map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                    ${task.tags.length > 3 ? `<span class="task-tag">+${task.tags.length - 3}</span>` : ''}
                </div>
            ` : ''}
            <div class="kanban-card-footer">
                <span>${task.dueDate ? '📅 ' + formatDate(task.dueDate) : '📅 Sin fecha'}</span>
                <div class="kanban-card-actions">
                    <button class="kanban-card-btn" onclick="editTask('${task.id}')" aria-label="Editar tarea ${escapeHtml(task.title)}" title="Editar">✏️</button>
                    <button class="kanban-card-btn" onclick="deleteTask('${task.id}')" aria-label="Eliminar tarea ${escapeHtml(task.title)}" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
        
        // Add keyboard navigation
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Tarea: ${task.title}. Prioridad: ${task.priority}. Columna: ${status}`);
        
        // Keyboard handler for moving cards
        card.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                handleKeyboardMove(e, task, status);
            }
        });
        
        // Add drag event listeners
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        
        column.appendChild(card);
    });
    
    // Update counts
    document.getElementById('todo-count').textContent = counts.todo;
    document.getElementById('progress-count').textContent = counts.progress;
    document.getElementById('review-count').textContent = counts.review;
    document.getElementById('done-count').textContent = counts.done;
    
    // Show empty states
    Object.keys(columns).forEach(status => {
        const column = columns[status];
        if (column && counts[status] === 0) {
            column.innerHTML = `
                <div class="kanban-empty">
                    <div class="kanban-empty-icon">📋</div>
                    <div>No hay tareas aquí</div>
                </div>
            `;
        }
    });
    
    // Setup drop zones
    Object.values(columns).forEach(column => {
        if (column) {
            column.addEventListener('dragover', handleDragOver);
            column.addEventListener('drop', handleDrop);
            column.addEventListener('dragleave', handleDragLeave);
        }
    });
}

// Drag and Drop Handlers
let draggedTask = null;

function handleDragStart(e) {
    draggedTask = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const column = e.target.closest('.kanban-column-content');
    if (column) {
        column.classList.add('drag-over');
    }
    
    return false;
}

function handleDragLeave(e) {
    const column = e.target.closest('.kanban-column-content');
    if (column) {
        column.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const column = e.target.closest('.kanban-column-content');
    if (!column) return false;
    
    column.classList.remove('drag-over');
    
    if (draggedTask) {
        const taskId = parseInt(draggedTask.dataset.taskId);
        const newStatus = column.dataset.status;
        
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.kanbanStatus = newStatus;
            
            // Auto-complete if moved to done
            if (newStatus === 'done' && !task.completed) {
                task.completed = true;
                task.completedAt = new Date().toISOString();
                showToast('¡Tarea completada!', `"${task.title}" movida a Completo`, 'success');
            }
            // Reopen if moved from done
            else if (newStatus !== 'done' && task.completed) {
                task.completed = false;
                task.completedAt = null;
                showToast('Tarea reactivada', `"${task.title}" movida a ${getStatusName(newStatus)}`, 'info');
            } else {
                showToast('Tarea movida', `"${task.title}" movida a ${getStatusName(newStatus)}`, 'info');
            }
            
            saveTasks();
            renderKanban();
        }
    }
    
    return false;
}

function getStatusName(status) {
    const names = {
        'todo': 'Por Hacer',
        'progress': 'En Curso',
        'review': 'Revisión',
        'done': 'Completo'
    };
    return names[status] || status;
}

// Keyboard navigation for Kanban board (accessibility)
function handleKeyboardMove(e, task, currentStatus) {
    e.preventDefault();
    const statuses = ['todo', 'progress', 'review', 'done'];
    const currentIndex = statuses.indexOf(currentStatus);
    
    let newIndex = currentIndex;
    if (e.key === 'ArrowRight' && currentIndex < statuses.length - 1) {
        newIndex = currentIndex + 1;
    } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    } else {
        return; // No movement
    }
    
    const newStatus = statuses[newIndex];
    task.kanbanStatus = newStatus;
    
    // Auto-complete/reopen logic
    if (newStatus === 'done' && !task.completed) {
        task.completed = true;
        task.completedAt = new Date().toISOString();
    } else if (newStatus !== 'done' && task.completed) {
        task.completed = false;
        task.completedAt = null;
    }
    
    saveTasks();
    renderKanban();
    announceToScreenReader(`Tarea "${task.title}" movida a ${getStatusName(newStatus)}`);
    showToast('Tarea movida', `"${task.title}" → ${getStatusName(newStatus)}`, 'info');
}

// Document Management Functions
function showAddDocumentForm() {
    document.getElementById('add-document-form').style.display = 'block';
}

function hideAddDocumentForm() {
    document.getElementById('add-document-form').style.display = 'none';
    document.getElementById('add-document-form').querySelector('form').reset();
}

function addDocument(event) {
    event.preventDefault();
    
    const title = document.getElementById('doc-title').value;
    const type = document.getElementById('doc-type').value;
    const description = document.getElementById('doc-description').value;
    const url = document.getElementById('doc-url').value;
    const version = document.getElementById('doc-version').value;
    
    const newDoc = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        type: type,
        description: description,
        url: url,
        version: version,
        createdAt: new Date().toISOString()
    };
    
    documents.push(newDoc);
    saveDocuments();
    renderDocuments();
    hideAddDocumentForm();
    showToast('¡Documento creado!', `"${title}" se ha agregado exitosamente`, 'success');
}

function deleteDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (confirm('¿Estás seguro de que quieres eliminar este documento?')) {
        documents = documents.filter(d => d.id !== docId);
        saveDocuments();
        renderDocuments();
        showToast('Documento eliminado', `"${doc.title}" ha sido eliminado`, 'info');
    }
}

function editDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    
    // Show form with document data
    showAddDocumentForm();
    document.getElementById('doc-title').value = doc.title;
    document.getElementById('doc-type').value = doc.type;
    document.getElementById('doc-description').value = doc.description;
    document.getElementById('doc-url').value = doc.url;
    document.getElementById('doc-version').value = doc.version;
    
    // Change form submit to update instead of add
    const form = document.getElementById('add-document-form').querySelector('form');
    form.onsubmit = function(event) {
        event.preventDefault();
        
        doc.title = document.getElementById('doc-title').value;
        doc.type = document.getElementById('doc-type').value;
        doc.description = document.getElementById('doc-description').value;
        doc.url = document.getElementById('doc-url').value;
        doc.version = document.getElementById('doc-version').value;
        
        saveDocuments();
        renderDocuments();
        hideAddDocumentForm();
        
        // Reset form submit to addDocument
        form.onsubmit = addDocument;
    };
}

function filterDocuments(filter) {
    documentFilter = filter;
    
    // Update filter buttons
    const filterButtons = document.querySelectorAll('#documents-section .filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        // Check button text to match filter
        const buttonText = btn.textContent.trim().toLowerCase();
        if ((filter === 'all' && buttonText === 'todos') ||
            (filter === 'especificacion' && buttonText === 'especificaciones') ||
            (filter === 'diseño' && buttonText === 'diseños') ||
            (filter === 'manual' && buttonText === 'manuales') ||
            (filter === 'reporte' && buttonText === 'reportes')) {
            btn.classList.add('active');
        }
    });
    
    renderDocuments();
}

function renderDocuments() {
    const documentsList = document.getElementById('documents-list');
    
    let filteredDocuments = documents;
    if (documentFilter !== 'all') {
        filteredDocuments = documents.filter(doc => doc.type === documentFilter);
    }
    
    if (filteredDocuments.length === 0) {
        documentsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <h3>No hay documentos</h3>
                <p>Agrega un nuevo documento para comenzar</p>
            </div>
        `;
        return;
    }
    
    documentsList.innerHTML = filteredDocuments.map(doc => `
        <div class="document-item">
            <div class="document-header">
                <div class="document-title">${escapeHtml(doc.title)}</div>
                <span class="document-type">${doc.type}</span>
            </div>
            ${doc.description ? `<div class="document-description">${escapeHtml(doc.description)}</div>` : ''}
            <div class="document-meta">
                ${doc.version ? `<div class="document-meta-item"><strong>Versión:</strong> ${escapeHtml(doc.version)}</div>` : ''}
                ${doc.url ? `<div class="document-meta-item"><strong>Enlace:</strong> <a href="${escapeHtml(doc.url)}" target="_blank" style="color: var(--primary-color);">Ver documento →</a></div>` : ''}
                <div class="document-meta-item"><strong>Creado:</strong> ${formatDate(doc.createdAt)}</div>
            </div>
            <div class="document-actions">
                <button class="btn btn-edit" onclick="editDocument(${doc.id})">✏️ Editar</button>
                <button class="btn btn-danger" onclick="deleteDocument(${doc.id})">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
}

function saveDocuments() {
    try {
        localStorage.setItem('documents', JSON.stringify(documents));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('Error de almacenamiento', 'Espacio lleno. Elimina datos antiguos.', 'error');
        } else {
            showToast('Error', 'No se pudieron guardar los cambios', 'error');
        }
        console.error('localStorage error:', e);
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('es-ES', options);
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'hace un momento';
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
    if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)} mes${Math.floor(diffDays / 30) > 1 ? 'es' : ''}`;
    return `hace ${Math.floor(diffDays / 365)} año${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
}

// Dashboard Functions
function renderDashboard() {
    updateDashboardStats();
    renderCharts();
    renderWeeklyProgress();
    renderTeamStats();
    renderRecentActivity();
}

function updateDashboardStats() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const pendingTasks = tasks.filter(t => !t.completed).length;
    const overdueTasks = tasks.filter(t => !t.completed && getTaskStatus(t) === 'overdue').length;
    const highPriorityTasks = tasks.filter(t => !t.completed && t.priority === 'alta').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Get tasks from this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const tasksThisWeek = tasks.filter(t => new Date(t.createdAt) > oneWeekAgo).length;
    
    document.getElementById('stat-total-tasks').textContent = totalTasks;
    document.getElementById('stat-completed-tasks').textContent = completedTasks;
    document.getElementById('stat-pending-tasks').textContent = pendingTasks;
    document.getElementById('stat-high-priority').textContent = highPriorityTasks;
    
    document.getElementById('stat-tasks-change').textContent = `+${tasksThisWeek} esta semana`;
    document.getElementById('stat-completion-rate').textContent = `${completionRate}% tasa completado`;
    document.getElementById('stat-pending-change').textContent = `${overdueTasks} vencidas`;
    document.getElementById('stat-priority-change').textContent = highPriorityTasks > 0 ? 'Requieren atención' : 'Todo bajo control';
}

function renderCharts() {
    renderStatusChart();
    renderPriorityChart();
}

function renderStatusChart() {
    const canvas = document.getElementById('status-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const completed = tasks.filter(t => t.completed).length;
    const pending = tasks.filter(t => !t.completed).length;
    
    drawPieChart(ctx, [
        { label: 'Completadas', value: completed, color: '#10b981' },
        { label: 'Pendientes', value: pending, color: '#f59e0b' }
    ]);
}

function renderPriorityChart() {
    const canvas = document.getElementById('priority-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const alta = tasks.filter(t => !t.completed && t.priority === 'alta').length;
    const media = tasks.filter(t => !t.completed && t.priority === 'media').length;
    const baja = tasks.filter(t => !t.completed && t.priority === 'baja').length;
    
    drawPieChart(ctx, [
        { label: 'Alta', value: alta, color: '#ef4444' },
        { label: 'Media', value: media, color: '#f59e0b' },
        { label: 'Baja', value: baja, color: '#3b82f6' }
    ]);
}

function drawPieChart(ctx, data) {
    const canvas = ctx.canvas;
    canvas.width = canvas.offsetWidth || 300;
    canvas.height = canvas.offsetHeight || 250;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.max(Math.min(centerX, centerY) - 20, 50);
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    if (total === 0) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos', centerX, centerY);
        return;
    }
    
    let currentAngle = -Math.PI / 2;
    
    data.forEach(item => {
        const sliceAngle = (item.value / total) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        
        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        if (item.value > 0) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.value, labelX, labelY);
        }
        
        currentAngle += sliceAngle;
    });
    
    // Draw legend
    let legendY = 20;
    data.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(canvas.width - 120, legendY, 15, 15);
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${item.label} (${item.value})`, canvas.width - 100, legendY + 12);
        legendY += 25;
    });
}

function renderWeeklyProgress() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    days.forEach((day, index) => {
        // Get tasks completed on this day of current week
        const targetDay = index + 1; // Monday = 1, Friday = 5
        const tasksCompletedOnDay = tasks.filter(t => {
            if (!t.completedAt) return false;
            const completedDate = new Date(t.completedAt);
            const dayOfWeek = completedDate.getDay();
            // Check if in current week
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
            weekStart.setHours(0, 0, 0, 0);
            return dayOfWeek === targetDay && completedDate >= weekStart;
        }).length;
        
        const maxTasks = 10; // For scaling
        const percentage = Math.min((tasksCompletedOnDay / maxTasks) * 100, 100);
        
        document.getElementById(`progress-${day}`).textContent = tasksCompletedOnDay;
        document.getElementById(`progress-${day}-bar`).style.width = `${percentage}%`;
    });
}

function renderTeamStats() {
    const teamStatsContainer = document.getElementById('team-stats');
    if (!teamStatsContainer) return;
    
    // Group tasks by assignee
    const teamData = {};
    tasks.forEach(task => {
        if (task.assignee) {
            if (!teamData[task.assignee]) {
                teamData[task.assignee] = { total: 0, completed: 0, pending: 0 };
            }
            teamData[task.assignee].total++;
            if (task.completed) {
                teamData[task.assignee].completed++;
            } else {
                teamData[task.assignee].pending++;
            }
        }
    });
    
    if (Object.keys(teamData).length === 0) {
        teamStatsContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay tareas asignadas aún</p>';
        return;
    }
    
    teamStatsContainer.innerHTML = Object.entries(teamData).map(([name, stats]) => {
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const completionRate = Math.round((stats.completed / stats.total) * 100);
        
        return `
            <div class="team-member">
                <div class="team-member-info">
                    <div class="team-avatar">${initials}</div>
                    <div class="team-member-name">${escapeHtml(name)}</div>
                </div>
                <div class="team-stats-badges">
                    <div class="team-stat-badge">
                        <div class="team-stat-value">${stats.total}</div>
                        <div class="team-stat-label">Total</div>
                    </div>
                    <div class="team-stat-badge">
                        <div class="team-stat-value" style="color: var(--success-color);">${stats.completed}</div>
                        <div class="team-stat-label">Completas</div>
                    </div>
                    <div class="team-stat-badge">
                        <div class="team-stat-value" style="color: var(--warning-color);">${stats.pending}</div>
                        <div class="team-stat-label">Pendientes</div>
                    </div>
                    <div class="team-stat-badge">
                        <div class="team-stat-value">${completionRate}%</div>
                        <div class="team-stat-label">Tasa</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentActivity() {
    const activityContainer = document.getElementById('recent-activity');
    if (!activityContainer) return;
    
    // Get recent tasks (last 5 created or completed)
    const recentTasks = [...tasks]
        .sort((a, b) => {
            const dateA = new Date(a.completedAt || a.createdAt);
            const dateB = new Date(b.completedAt || b.createdAt);
            return dateB - dateA;
        })
        .slice(0, 10);
    
    if (recentTasks.length === 0) {
        activityContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No hay actividad reciente</p>';
        return;
    }
    
    activityContainer.innerHTML = recentTasks.map(task => {
        const isCompleted = task.completed;
        const activityType = isCompleted ? 'completed' : 'created';
        const icon = isCompleted ? '✓' : '➕';
        const action = isCompleted ? 'completó' : 'creó';
        const time = formatRelativeTime(isCompleted ? task.completedAt : task.createdAt);
        
        return `
            <div class="activity-item ${activityType}">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-text">
                        ${task.assignee ? `<strong>${escapeHtml(task.assignee)}</strong>` : 'Alguien'} 
                        ${action} <strong>${escapeHtml(task.title)}</strong>
                    </div>
                    <div class="activity-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// TIME SHEETS MODULE - OEE (Overall Equipment Effectiveness)
// ============================================================================

let timesheets = JSON.parse(localStorage.getItem('timesheets')) || [];
let currentTimesheetId = null;

// Loss type definitions by category
const lossTypes = {
    disponibilidad: [
        'Avería / Falla de Equipo',
        'Setup / Cambio de Formato',
        'Mantenimiento Programado',
        'Falta de Material',
        'Falta de Personal',
        'Problema de Servicios (energía, agua, etc)',
        'Otro'
    ],
    rendimiento: [
        'Marcha en Vacío / Paradas Menores',
        'Velocidad Reducida',
        'Arranque / Calentamiento',
        'Ajustes / Regulaciones',
        'Espera por Cambio',
        'Otro'
    ],
    calidad: [
        'Defectos de Proceso',
        'Scrap / Desperdicio',
        'Retrabajo / Reproceso',
        'Arranque de Producción',
        'Producto Fuera de Especificación',
        'Otro'
    ]
};

// Initialize time sheets
document.addEventListener('DOMContentLoaded', function() {
    renderTimesheets();
});

// Save timesheets to localStorage
function saveTimesheets() {
    try {
        localStorage.setItem('timesheets', JSON.stringify(timesheets));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('Error de almacenamiento', 'Espacio lleno. Elimina datos antiguos.', 'error');
        } else {
            showToast('Error', 'No se pudieron guardar los cambios', 'error');
        }
        console.error('localStorage error:', e);
    }
}

// Show/Hide Forms
function showAddTimesheetForm() {
    document.getElementById('add-timesheet-form').style.display = 'block';
    // Set today's date as default
    document.getElementById('ts-date').valueAsDate = new Date();
}

function hideAddTimesheetForm() {
    document.getElementById('add-timesheet-form').style.display = 'none';
    document.querySelector('#add-timesheet-form form').reset();
}

// Add new timesheet
function addTimesheet(event) {
    event.preventDefault();
    
    const date = document.getElementById('ts-date').value;
    const line = document.getElementById('ts-line').value;
    const product = document.getElementById('ts-product').value;
    const supervisor = document.getElementById('ts-supervisor').value;
    
    // Shift configuration
    const shifts = [
        {
            number: 1,
            start: document.getElementById('ts-shift1-start').value,
            end: document.getElementById('ts-shift1-end').value,
            break: parseInt(document.getElementById('ts-shift1-break').value) || 0
        },
        {
            number: 2,
            start: document.getElementById('ts-shift2-start').value,
            end: document.getElementById('ts-shift2-end').value,
            break: parseInt(document.getElementById('ts-shift2-break').value) || 0
        },
        {
            number: 3,
            start: document.getElementById('ts-shift3-start').value,
            end: document.getElementById('ts-shift3-end').value,
            break: parseInt(document.getElementById('ts-shift3-break').value) || 0
        }
    ];
    
    const capacity = parseFloat(document.getElementById('ts-capacity').value);
    const actualProduction = parseInt(document.getElementById('ts-actual-production').value);
    const defects = parseInt(document.getElementById('ts-defects').value) || 0;
    
    const timesheet = {
        id: `ts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date,
        line,
        product,
        supervisor,
        shifts,
        capacity,
        actualProduction,
        defects,
        losses: [],
        createdAt: new Date().toISOString()
    };
    
    timesheets.unshift(timesheet);
    saveTimesheets();
    hideAddTimesheetForm();
    renderTimesheets();
    showToast('¡Planilla creada!', `Planilla para ${line} - ${product}`, 'success');
}

// Render timesheets list
function renderTimesheets() {
    const container = document.getElementById('timesheets-list');
    if (!container) return;
    
    if (timesheets.length === 0) {
        container.innerHTML = `
            <div class="timesheets-empty">
                <div class="timesheets-empty-icon">⏱️</div>
                <h3>No hay planillas registradas</h3>
                <p>Crea una nueva planilla para comenzar a registrar tiempos y pérdidas</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = timesheets.map(ts => {
        const oee = calculateOEE(ts);
        const oeeClass = oee.final >= 85 ? 'good' : oee.final >= 65 ? 'warning' : 'danger';
        
        return `
            <div class="timesheet-card" onclick="viewTimesheet(${ts.id})">
                <div class="timesheet-header">
                    <div>
                        <div class="timesheet-title">${escapeHtml(ts.line)}</div>
                        <div class="timesheet-date">📅 ${formatDate(ts.date)}</div>
                    </div>
                </div>
                
                <div class="timesheet-info">
                    <div class="timesheet-info-item">
                        <div class="timesheet-info-label">Producto</div>
                        <div class="timesheet-info-value">${escapeHtml(ts.product)}</div>
                    </div>
                    <div class="timesheet-info-item">
                        <div class="timesheet-info-label">Supervisor</div>
                        <div class="timesheet-info-value">${escapeHtml(ts.supervisor)}</div>
                    </div>
                    <div class="timesheet-info-item">
                        <div class="timesheet-info-label">Producción Real</div>
                        <div class="timesheet-info-value">${ts.actualProduction.toLocaleString()} pcs</div>
                    </div>
                    <div class="timesheet-info-item">
                        <div class="timesheet-info-label">Pérdidas Registradas</div>
                        <div class="timesheet-info-value">${ts.losses.length}</div>
                    </div>
                </div>
                
                <div class="timesheet-oee">
                    <span class="timesheet-oee-label">OEE Final:</span>
                    <span class="timesheet-oee-value ${oeeClass}">${oee.final.toFixed(1)}%</span>
                </div>
                
                <div class="timesheet-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-primary" onclick="viewTimesheet(${ts.id})">Ver Detalles</button>
                    <button class="btn btn-danger" onclick="deleteTimesheet(${ts.id})">Eliminar</button>
                </div>
            </div>
        `;
    }).join('');
}

// View timesheet details (losses section)
function viewTimesheet(id) {
    currentTimesheetId = id;
    const timesheet = timesheets.find(ts => ts.id === id);
    if (!timesheet) return;
    
    // Hide timesheets list and form
    document.getElementById('add-timesheet-form').style.display = 'none';
    document.getElementById('timesheets-list').style.display = 'none';
    document.querySelector('#module-timesheets .section-header').style.display = 'none';
    
    // Show losses section
    document.getElementById('losses-section').style.display = 'block';
    document.getElementById('current-timesheet-title').textContent = 
        `${timesheet.line} - ${timesheet.product} (${formatDate(timesheet.date)})`;
    
    renderLosses();
    renderOEEMetrics();
    renderParetoChart();
}

// Hide losses section
function hideLossesSection() {
    currentTimesheetId = null;
    document.getElementById('losses-section').style.display = 'none';
    document.getElementById('add-loss-form').style.display = 'none';
    document.getElementById('timesheets-list').style.display = 'grid';
    document.querySelector('#module-timesheets .section-header').style.display = 'flex';
}

// Show/Hide Loss Form
function showAddLossForm() {
    document.getElementById('add-loss-form').style.display = 'block';
}

function hideAddLossForm() {
    document.getElementById('add-loss-form').style.display = 'none';
    document.querySelector('#add-loss-form form').reset();
    document.getElementById('loss-type').innerHTML = '<option value="">Seleccionar categoría primero...</option>';
}

// Update loss types dropdown based on category
function updateLossTypes() {
    const category = document.getElementById('loss-category').value;
    const typeSelect = document.getElementById('loss-type');
    
    if (!category) {
        typeSelect.innerHTML = '<option value="">Seleccionar categoría primero...</option>';
        return;
    }
    
    const types = lossTypes[category] || [];
    typeSelect.innerHTML = types.map(type => 
        `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
    ).join('');
}

// Add loss
function addLoss(event) {
    event.preventDefault();
    
    const timesheet = timesheets.find(ts => ts.id === currentTimesheetId);
    if (!timesheet) return;
    
    const category = document.getElementById('loss-category').value;
    const type = document.getElementById('loss-type').value;
    const duration = parseInt(document.getElementById('loss-duration').value);
    const shift = parseInt(document.getElementById('loss-shift').value);
    const description = document.getElementById('loss-description').value;
    
    const loss = {
        id: `loss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category,
        type,
        duration,
        shift,
        description,
        createdAt: new Date().toISOString()
    };
    
    timesheet.losses.push(loss);
    saveTimesheets();
    hideAddLossForm();
    renderLosses();
    renderOEEMetrics();
    renderParetoChart();
    renderTimesheets(); // Update main list
    showToast('Pérdida registrada', `${duration} min - ${type}`, 'warning');
}

// Render losses
function renderLosses() {
    const timesheet = timesheets.find(ts => ts.id === currentTimesheetId);
    if (!timesheet) return;
    
    const container = document.getElementById('losses-list');
    
    if (timesheet.losses.length === 0) {
        container.innerHTML = `
            <div class="timesheets-empty">
                <div class="timesheets-empty-icon">📉</div>
                <h3>No hay pérdidas registradas</h3>
                <p>Registra las paradas y pérdidas para analizar la eficiencia</p>
            </div>
        `;
        return;
    }
    
    // Sort by duration (largest first)
    const sortedLosses = [...timesheet.losses].sort((a, b) => b.duration - a.duration);
    
    container.innerHTML = sortedLosses.map(loss => `
        <div class="loss-card ${loss.category}">
            <div class="loss-header">
                <div>
                    <div class="loss-title">${escapeHtml(loss.type)}</div>
                    <span class="loss-category-badge ${loss.category}">${loss.category}</span>
                </div>
                <div class="loss-duration">${loss.duration} min</div>
            </div>
            
            <div class="loss-meta">
                <span>🔄 Turno ${loss.shift}</span>
                <span>🕐 ${formatRelativeTime(loss.createdAt)}</span>
            </div>
            
            ${loss.description ? `
                <div class="loss-description">${escapeHtml(loss.description)}</div>
            ` : ''}
            
            <div class="loss-actions">
                <button class="btn btn-danger btn-sm" onclick="deleteLoss(${loss.id})">
                    🗑️ Eliminar
                </button>
            </div>
        </div>
    `).join('');
}

// Delete loss
function deleteLoss(lossId) {
    const timesheet = timesheets.find(ts => ts.id === currentTimesheetId);
    if (!timesheet) return;
    
    if (confirm('¿Eliminar esta pérdida?')) {
        timesheet.losses = timesheet.losses.filter(loss => loss.id !== lossId);
        saveTimesheets();
        renderLosses();
        renderOEEMetrics();
        renderParetoChart();
        renderTimesheets();
        showToast('Pérdida eliminada', '', 'info');
    }
}

// Delete timesheet
function deleteTimesheet(id) {
    if (confirm('¿Eliminar esta planilla y todas sus pérdidas?')) {
        timesheets = timesheets.filter(ts => ts.id !== id);
        saveTimesheets();
        renderTimesheets();
        showToast('Planilla eliminada', '', 'info');
    }
}

// Calculate OEE
function calculateOEE(timesheet) {
    // Calculate total planned time (all 3 shifts minus breaks)
    const totalPlannedMinutes = timesheet.shifts.reduce((total, shift) => {
        const start = parseTime(shift.start);
        const end = parseTime(shift.end);
        let shiftMinutes = end - start;
        
        // Handle overnight shifts
        if (shiftMinutes < 0) {
            shiftMinutes += 24 * 60;
        }
        
        return total + (shiftMinutes - shift.break);
    }, 0);
    
    // Calculate total downtime from losses
    const totalDowntime = timesheet.losses.reduce((sum, loss) => sum + loss.duration, 0);
    
    // Calculate operating time
    const operatingTime = totalPlannedMinutes - totalDowntime;
    
    // Calculate availability
    const availability = (operatingTime / totalPlannedMinutes) * 100;
    
    // Calculate theoretical production
    const theoreticalProduction = operatingTime * timesheet.capacity;
    
    // Calculate performance
    const performance = (timesheet.actualProduction / theoreticalProduction) * 100;
    
    // Calculate quality
    const goodPieces = timesheet.actualProduction - timesheet.defects;
    const quality = (goodPieces / timesheet.actualProduction) * 100;
    
    // Calculate final OEE
    const oee = (availability * performance * quality) / 10000;
    
    return {
        availability: isNaN(availability) ? 0 : availability,
        performance: isNaN(performance) ? 0 : performance,
        quality: isNaN(quality) ? 0 : quality,
        final: isNaN(oee) ? 0 : oee
    };
}

// Helper function to parse time string "HH:MM" to minutes
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Render OEE metrics
function renderOEEMetrics() {
    const timesheet = timesheets.find(ts => ts.id === currentTimesheetId);
    if (!timesheet) return;
    
    const oee = calculateOEE(timesheet);
    
    document.getElementById('oee-availability').textContent = oee.availability.toFixed(1) + '%';
    document.getElementById('oee-performance').textContent = oee.performance.toFixed(1) + '%';
    document.getElementById('oee-quality').textContent = oee.quality.toFixed(1) + '%';
    document.getElementById('oee-final').textContent = oee.final.toFixed(1) + '%';
    
    // Color code the final OEE
    const finalElement = document.getElementById('oee-final');
    finalElement.style.color = oee.final >= 85 ? 'var(--success-color)' : 
                                oee.final >= 65 ? 'var(--warning-color)' : 
                                'var(--danger-color)';
}

// Render Pareto chart
function renderParetoChart() {
    const timesheet = timesheets.find(ts => ts.id === currentTimesheetId);
    if (!timesheet || timesheet.losses.length === 0) return;
    
    // Group losses by type and sum durations
    const lossesData = {};
    timesheet.losses.forEach(loss => {
        if (!lossesData[loss.type]) {
            lossesData[loss.type] = 0;
        }
        lossesData[loss.type] += loss.duration;
    });
    
    // Convert to array and sort by duration
    const sortedData = Object.entries(lossesData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10
    
    const canvas = document.getElementById('pareto-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.parentElement.clientWidth;
    const height = 300;
    canvas.width = width;
    canvas.height = height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const padding = { top: 40, right: 60, bottom: 100, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Calculate totals
    const totalLoss = sortedData.reduce((sum, [, duration]) => sum + duration, 0);
    let cumulativePercent = 0;
    
    // Bar width
    const barWidth = chartWidth / sortedData.length;
    const barPadding = barWidth * 0.2;
    const actualBarWidth = barWidth - barPadding;
    
    // Draw bars and cumulative line
    sortedData.forEach(([type, duration], index) => {
        const barHeight = (duration / totalLoss) * chartHeight;
        const x = padding.left + index * barWidth;
        const y = padding.top + chartHeight - barHeight;
        
        // Draw bar
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x + barPadding / 2, y, actualBarWidth, barHeight);
        
        // Draw value on bar
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${duration}m`, x + barWidth / 2, y - 5);
        
        // Draw label
        ctx.save();
        ctx.translate(x + barWidth / 2, height - padding.bottom + 10);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillText(type.substring(0, 20), 0, 0);
        ctx.restore();
        
        // Calculate cumulative percentage
        cumulativePercent += (duration / totalLoss) * 100;
        
        // Draw cumulative line point
        const lineY = padding.top + chartHeight * (1 - cumulativePercent / 100);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x + barWidth / 2, lineY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw line to next point
        if (index < sortedData.length - 1) {
            const nextPercent = cumulativePercent + (sortedData[index + 1][1] / totalLoss) * 100;
            const nextLineY = padding.top + chartHeight * (1 - nextPercent / 100);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + barWidth / 2, lineY);
            ctx.lineTo(x + barWidth * 1.5, nextLineY);
            ctx.stroke();
        }
    });
    
    // Draw axes
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();
    
    // Draw title
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Top 10 Pérdidas por Tiempo (Principio de Pareto)', width / 2, 20);
    
    // Draw percentage axis
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 100; i += 20) {
        const y = padding.top + chartHeight * (1 - i / 100);
        ctx.fillText(`${i}%`, width - padding.right + 40, y + 4);
        
        // Draw grid line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }
}
