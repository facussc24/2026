// Data Storage
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let documents = JSON.parse(localStorage.getItem('documents')) || [];
let taskFilter = 'all';
let documentFilter = 'all';
let idCounter = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    renderTasks();
    renderDocuments();
});

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
    
    const task = {
        id: Date.now() + (idCounter++),
        title: title,
        description: description,
        priority: priority,
        dueDate: dueDate,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    saveTasks();
    renderTasks();
    hideAddTaskForm();
}

function deleteTask(taskId) {
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
        tasks = tasks.filter(task => task.id !== taskId);
        saveTasks();
        renderTasks();
    }
}

function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
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
    
    // Change form submit to update instead of add
    const form = document.getElementById('add-task-form').querySelector('form');
    form.onsubmit = function(event) {
        event.preventDefault();
        
        task.title = document.getElementById('task-title').value;
        task.description = document.getElementById('task-description').value;
        task.priority = document.getElementById('task-priority').value;
        task.dueDate = document.getElementById('task-due-date').value;
        
        saveTasks();
        renderTasks();
        hideAddTaskForm();
        
        // Reset form submit to addTask
        form.onsubmit = addTask;
    };
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
    if (taskFilter === 'pending') {
        filteredTasks = tasks.filter(task => !task.completed);
    } else if (taskFilter === 'completed') {
        filteredTasks = tasks.filter(task => task.completed);
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
    
    tasksList.innerHTML = filteredTasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <div class="task-header">
                <div class="task-title-section">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        <span class="task-badge badge-${task.priority}">${task.priority.toUpperCase()}</span>
                        ${task.dueDate ? `<span class="task-badge" style="background: #e0e7ff; color: #3730a3;">📅 ${formatDate(task.dueDate)}</span>` : ''}
                    </div>
                </div>
            </div>
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-actions">
                <label class="checkbox-label">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete(${task.id})">
                    ${task.completed ? 'Completada' : 'Marcar como completada'}
                </label>
                <button class="btn btn-edit" onclick="editTask(${task.id})">✏️ Editar</button>
                <button class="btn btn-danger" onclick="deleteTask(${task.id})">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
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
}

function deleteDocument(docId) {
    if (confirm('¿Estás seguro de que quieres eliminar este documento?')) {
        documents = documents.filter(doc => doc.id !== docId);
        saveDocuments();
        renderDocuments();
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
