// /public/js/version-checker.js

// Estado local para almacenar la información de la versión actual y la nueva.
let currentVersionInfo = null;
let newVersionInfo = null;
let checkInterval = null;

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos

// Elementos del DOM
const banner = document.getElementById('update-notification-banner');
const modal = document.getElementById('release-notes-modal');
const releaseNotesContent = document.getElementById('release-notes-content');
const viewNotesBtn = document.getElementById('view-release-notes-btn');
const updateNowBtn = document.getElementById('update-now-btn');
const closeButtons = document.querySelectorAll('[data-action="close-release-notes-modal"]');

/**
 * Obtiene el archivo version.json del servidor, evitando la caché.
 * @returns {Promise<object|null>} La información de la versión o null si hay un error.
 */
async function fetchVersionInfo() {
    try {
        const response = await fetch(`/version.json?t=${new Date().getTime()}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });
        if (!response.ok) {
            console.error('[Versiones] Error: No se pudo encontrar el archivo version.json en el servidor. Código de estado:', response.status);
            return null;
        }
        const data = await response.json();
        console.log('[Versiones] Información de versión remota obtenida:', data);
        return data;
    } catch (error) {
        console.error('[Versiones] Error catastrófico al obtener la información de la versión:', error);
        return null;
    }
}

/**
 * Muestra el banner de notificación de actualización.
 */
function showUpdateNotification() {
    if (banner) {
        banner.classList.remove('hidden');
        // Detener las comprobaciones futuras una vez que se muestra la notificación.
        if (checkInterval) {
            clearInterval(checkInterval);
        }
    }
}

/**
 * Comprueba si hay una nueva versión disponible.
 */
async function checkForUpdates() {
    console.log('[Versiones] Buscando actualizaciones...');
    const latestVersion = await fetchVersionInfo();

    if (!latestVersion || !latestVersion.hash) {
        console.error('[Versiones] No se pudo obtener la información de la versión más reciente o el hash está vacío.');
        return;
    }

    // La primera vez, solo almacenamos la versión actual.
    if (currentVersionInfo === null) {
        currentVersionInfo = latestVersion;
        console.log(`[Versiones] Versión inicial cargada. Hash: ${currentVersionInfo.hash}`);
        return;
    }

    // Comparamos los hashes para ver si hay una nueva versión.
    const hasNewVersion = latestVersion.hash !== currentVersionInfo.hash;
    console.log(`[Versiones] Comparando hashes -> Actual: ${currentVersionInfo.hash}, Remoto: ${latestVersion.hash}. ¿Hay nueva versión? ${hasNewVersion}`);

    if (hasNewVersion) {
        console.log(`[Versiones] ¡Nueva versión detectada!`);
        newVersionInfo = latestVersion;
        showUpdateNotification();
    } else {
        console.log('[Versiones] La aplicación ya está en la última versión.');
    }
}

/**
 * Muestra el modal con las notas de la versión.
 */
function showReleaseNotes() {
    if (modal && newVersionInfo) {
        releaseNotesContent.textContent = newVersionInfo.message || 'No se proporcionaron detalles para esta versión.';
        modal.classList.remove('hidden');
    }
}

/**
 * Oculta el modal de las notas de la versión.
 */
function hideReleaseNotes() {
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Recarga la página forzando la descarga de todos los recursos.
 */
function applyUpdate() {
    // true fuerza una recarga desde el servidor, no desde la caché.
    window.location.reload(true);
}

/**
 * Inicializa el verificador de versiones.
 */
export function initVersionChecker() {
    console.log('[Versiones] Inicializando el verificador de versiones...');

    if (!banner || !modal) {
        console.error('[Versiones] Error: No se encontraron los elementos del DOM necesarios (banner o modal). El script no puede continuar.');
        return;
    }

    // Asignar eventos a los botones
    viewNotesBtn.addEventListener('click', showReleaseNotes);
    updateNowBtn.addEventListener('click', applyUpdate);
    closeButtons.forEach(btn => btn.addEventListener('click', hideReleaseNotes));

    // Realizar una comprobación inicial al cargar la página.
    // Usamos un pequeño retraso para no interferir con la carga inicial de la aplicación.
    setTimeout(checkForUpdates, 3000);

    // Configurar la comprobación periódica.
    checkInterval = setInterval(checkForUpdates, CHECK_INTERVAL_MS);

    console.log('[Versiones] Verificador inicializado. Próxima comprobación en 15 minutos.');
}