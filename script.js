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
    
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close" onclick="closeToast(this)">×</button>
    `;
    
    container.appendChild(toast);
    
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
        id: Date.now() + (idCounter++),
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

function searchTasks() {
    taskSearchQuery = document.getElementById('task-search').value.toLowerCase();
    renderTasks();
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
    localStorage.setItem('tasks', JSON.stringify(tasks));
    // Update dashboard if it exists
    if (document.getElementById('stat-total-tasks')) {
        renderDashboard();
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
                    <button class="kanban-card-btn" onclick="editTask(${task.id})" title="Editar">✏️</button>
                    <button class="kanban-card-btn" onclick="deleteTask(${task.id})" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
        
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
        id: Date.now() + (idCounter++),
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
    localStorage.setItem('documents', JSON.stringify(documents));
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
