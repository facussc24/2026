// /public/modules/admin/versions.js

import { createVersion, getVersions } from '../../js/services/version.service.js';
import { showToast } from '../../js/utils.js';

/**
 * Ensures the marked.js library is loaded and ready to use.
 * @returns {Promise<void>} A promise that resolves when marked.js is available.
 */
function ensureMarkedIsLoaded() {
    if (typeof window.marked !== 'undefined') {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        script.onload = () => {
            console.log('marked.js loaded dynamically for version history.');
            resolve();
        };
        script.onerror = () => {
            console.error('Failed to load marked.js');
            showToast('Error al cargar el renderizador de notas.', 'error');
            resolve(); // Resolve anyway to not block execution, the renderer will show an error.
        };
        document.head.appendChild(script);
    });
}

/**
 * Renders the list of historical versions into the table.
 * @param {import('../../js/models/Version.js').Version[]} versions - Array of version objects.
 */
function renderVersionHistory(versions) {
    const tableBody = document.getElementById('versions-history-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear existing rows

    if (versions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No se han publicado versiones.</td></tr>`;
        return;
    }

    // Ensure marked is available before trying to parse
    if (typeof window.marked === 'undefined') {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Error: No se pudo cargar el visualizador de notas.</td></tr>`;
        return;
    }

    versions.forEach(version => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${version.versionTag}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${version.releaseDate.toLocaleDateString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${version.publishedBy}</td>
            <td class="px-6 py-4 text-sm text-gray-500">
                <details>
                    <summary class="cursor-pointer">Ver Notas</summary>
                    <div class="prose prose-sm mt-2 p-2 bg-gray-50 rounded">${window.marked.parse(version.notes || '')}</div>
                </details>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Fetches and displays the version history.
 */
async function loadVersionHistory() {
    const versions = await getVersions();
    renderVersionHistory(versions);
}

/**
 * Handles the form submission for publishing a new version.
 * @param {Event} event - The form submission event.
 */
async function handlePublishVersion(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const versionTag = form.elements.versionTag.value.trim();
    const notes = form.elements.releaseNotes.value.trim();

    if (!versionTag || !notes) {
        showToast('Por favor, complete todos los campos.', 'error');
        return;
    }

    button.disabled = true;
    button.textContent = 'Publicando...';

    try {
        await createVersion(versionTag, notes);
        showToast('Nueva versión publicada con éxito. Se notificará a los usuarios.', 'success');
        form.reset();
        // Refresh the history list
        await loadVersionHistory();
    } catch (error) {
        console.error('Error publishing version:', error);
        showToast(error.message || 'No se pudo publicar la versión.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Publicar Versión';
    }
}

/**
 * Initializes the Version Management module.
 */
async function initVersionManagement() {
    const form = document.getElementById('version-form');
    if (form) {
        form.addEventListener('submit', handlePublishVersion);
    }

    // Ensure the library is loaded before attempting to render anything that depends on it.
    await ensureMarkedIsLoaded();

    // Now that we are sure marked.js is loaded (or has failed gracefully),
    // we can load and render the version history.
    await loadVersionHistory();
}

// Initialize the module
initVersionManagement();