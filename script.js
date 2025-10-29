// Data Storage
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let documents = JSON.parse(localStorage.getItem('documents')) || [];
let taskFilter = 'all';
let documentFilter = 'all';
let taskSearchQuery = '';
let idCounter = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    createToastContainer();
    renderTasks();
    renderDocuments();
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
