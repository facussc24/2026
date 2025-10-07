// public/auth.js

// Firebase imports needed for auth
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from './utils.js';

// These will be initialized by main.js
let auth;
let db;
let notify = (message, type = 'info') => {
    console.warn('showToast no ha sido inicializado.', { message, type });
};

const AUTH_SCREENS = new Set(['login', 'register', 'reset', 'verify-email']);
const SCREEN_HASH_MAP = {
    login: '#/login',
    register: '#/register',
    reset: '#/reset-password',
    'verify-email': '#/verify-email'
};
const HASH_SCREEN_MAP = Object.entries(SCREEN_HASH_MAP).reduce((acc, [screen, hash]) => {
    acc[hash] = screen;
    return acc;
}, {});

let suppressNextHashSync = false;
let currentScreen = null;

/**
 * @constant {Object} DOM_ELEMENTS
 * @description Centraliza los IDs de los elementos del DOM utilizados por el módulo.
 * Esto facilita el mantenimiento si los IDs cambian en el HTML.
 */
const DOM_ELEMENTS = {
    loginPanel: 'login-panel',
    registerPanel: 'register-panel',
    resetPanel: 'reset-panel',
    verifyEmailPanel: 'verify-email-panel',
    resendVerificationBtn: 'resend-verification-btn',
    resendTimer: 'resend-timer',
    loginForm: 'login-form',
    registerForm: 'register-form',
    resetForm: 'reset-form',
    logoutButton: 'logout-button'
};

const SCREEN_TO_PANEL_ID = {
    login: DOM_ELEMENTS.loginPanel,
    register: DOM_ELEMENTS.registerPanel,
    reset: DOM_ELEMENTS.resetPanel,
    'verify-email': DOM_ELEMENTS.verifyEmailPanel
};

/**
 * @type {Object.<string, HTMLElement>}
 * @description Un objeto proxy para acceder a los elementos del DOM de forma dinámica.
 * En lugar de buscar todos los elementos al inicio, los busca bajo demanda
 * y los cachea para futuras referencias.
 */
const dom = new Proxy({}, {
    get: function(target, prop) {
        if (prop in target) {
            return target[prop];
        }
        const elementId = DOM_ELEMENTS[prop];
        if (elementId) {
            const element = document.getElementById(elementId);
            target[prop] = element; // Cache the element
            return element;
        }
        return undefined;
    }
});

let isTransitioning = false;
let queuedScreen = null;

export function showAuthScreen(screenName, options = {}) {
    const { updateHash = true } = options;
    const normalizedScreen = AUTH_SCREENS.has(screenName) ? screenName : 'login';

    if (isTransitioning) {
        if (queuedScreen?.screenName !== normalizedScreen) {
            queuedScreen = { screenName: normalizedScreen, options };
        }
        return;
    }

    if (normalizedScreen === currentScreen) return;

    isTransitioning = true;

    const panelToHideId = SCREEN_TO_PANEL_ID[currentScreen];
    const panelToHide = panelToHideId ? document.getElementById(panelToHideId) : null;

    const panelToShowId = SCREEN_TO_PANEL_ID[normalizedScreen];
    const panelToShow = panelToShowId ? document.getElementById(panelToShowId) : null;

    if (!panelToShow) {
        isTransitioning = false;
        return;
    }

    const transitionDuration = 200;

    if (panelToHide) {
        panelToHide.style.transition = `opacity ${transitionDuration}ms ease, transform ${transitionDuration}ms ease`;
        panelToHide.style.opacity = '0';
        panelToHide.style.transform = 'scale(0.98)';

        setTimeout(() => {
            panelToHide.classList.add('hidden');
        }, transitionDuration);
    }

    panelToShow.classList.remove('hidden');
    panelToShow.style.opacity = '0';
    panelToShow.style.transform = 'scale(0.98)';
    panelToShow.style.transition = `opacity ${transitionDuration}ms ease, transform ${transitionDuration}ms ease`;

    requestAnimationFrame(() => {
        panelToShow.style.opacity = '1';
        panelToShow.style.transform = 'scale(1)';
    });

    setTimeout(() => {
        if (panelToHide) {
            panelToHide.style.transition = '';
            panelToHide.style.transform = '';
            panelToHide.style.opacity = '';
        }
        panelToShow.style.transition = '';
        panelToShow.style.transform = '';
        panelToShow.style.opacity = '';

        isTransitioning = false;
        const firstInput = panelToShow.querySelector('input:not([type="hidden"])');
        if (firstInput) firstInput.focus();

        if (queuedScreen) {
            const { screenName: nextScreen, options: nextOptions } = queuedScreen;
            queuedScreen = null;
            showAuthScreen(nextScreen, nextOptions);
        }
    }, transitionDuration);

    currentScreen = normalizedScreen;

    if (updateHash) {
        const expectedHash = SCREEN_HASH_MAP[normalizedScreen];
        if (expectedHash && window.location.hash !== expectedHash) {
            suppressNextHashSync = true;
            window.location.hash = expectedHash;
        }
    }

    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

function getScreenFromHash(hashValue) {
    if (!hashValue) return 'login';
    const normalizedHash = hashValue.startsWith('#') ? hashValue : `#${hashValue}`;
    return HASH_SCREEN_MAP[normalizedHash] || 'login';
}

function syncAuthScreenWithHash() {
    const hash = window.location.hash;
    const screen = getScreenFromHash(hash);
    const shouldUpdateHash = hash !== SCREEN_HASH_MAP[screen];
    showAuthScreen(screen, { updateHash: shouldUpdateHash });
}

function handleAuthHashChange() {
    if (suppressNextHashSync) {
        suppressNextHashSync = false;
        return;
    }

    const screen = getScreenFromHash(window.location.hash);
    if (screen !== currentScreen) {
        showAuthScreen(screen, { updateHash: false });
    }
}

async function handleResendVerificationEmail() {
    if (!dom.resendVerificationBtn || !dom.resendTimer || dom.resendVerificationBtn.disabled) return;

    dom.resendVerificationBtn.disabled = true;
    dom.resendTimer.textContent = 'Enviando...';

    try {
        await sendEmailVerification(auth.currentUser);
        notify('Se ha enviado un nuevo correo de verificación.', 'success');

        // Cooldown timer
        let seconds = 60;
        dom.resendTimer.textContent = `Puedes reenviar de nuevo en ${seconds}s.`;
        const interval = setInterval(() => {
            seconds--;
            if (seconds > 0) {
                dom.resendTimer.textContent = `Puedes reenviar de nuevo en ${seconds}s.`;
            } else {
                clearInterval(interval);
                dom.resendTimer.textContent = '';
                dom.resendVerificationBtn.disabled = false;
            }
        }, 1000);

    } catch (error) {
        console.error("Error resending verification email:", error);
        let friendlyMessage = 'Error al reenviar el correo.';
        if (error.code === 'auth/too-many-requests') {
            friendlyMessage = 'Demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.';
        }
        notify(friendlyMessage, 'error');
        dom.resendTimer.textContent = 'Hubo un error. Inténtalo de nuevo más tarde.';
        setTimeout(() => {
            if (dom.resendTimer.textContent.includes('error')) {
                 dom.resendTimer.textContent = '';
            }
            dom.resendVerificationBtn.disabled = false;
        }, 30000);
    }
}


async function handleLogin(form, email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // The onAuthStateChanged listener will handle successful login
}

async function handleRegister(form, email, password) {
    const name = form.querySelector('#register-name').value.trim();
    const emailField = form.querySelector('#register-email');
    const sanitizedEmail = email.trim();
    const normalizedEmail = sanitizedEmail.toLowerCase();

    if (emailField) {
        emailField.setCustomValidity('');
    }

    if (!normalizedEmail.endsWith('@barackmercosul.com')) {
        if (emailField) {
            emailField.setCustomValidity('Introduce un correo corporativo válido @barackmercosul.com.');
            emailField.reportValidity();
        }
        throw new Error('auth/unauthorized-domain');
    }

    const userCredential = await createUserWithEmailAndPassword(auth, sanitizedEmail, password);
    await updateProfile(userCredential.user, { displayName: name });

    await setDoc(doc(db, COLLECTIONS.USUARIOS, userCredential.user.uid), {
        id: userCredential.user.uid,
        name: name,
        email: userCredential.user.email,
        role: 'lector',
        sector: 'Sin Asignar',
        createdAt: new Date()
    });

    await sendEmailVerification(userCredential.user);
    form.reset();
    notify('¡Registro exitoso! Revisa tu correo para verificar tu cuenta.', 'success');
    showAuthScreen('verify-email');
}

async function handlePasswordReset(form, email) {
    await sendPasswordResetEmail(auth, email.trim());
    form.reset();
    notify(`Si la cuenta ${email} existe, se ha enviado un enlace para restablecer la contraseña.`, 'info');
    showAuthScreen('login');
}

export async function handleAuthForms(e) {
    e.preventDefault();
    const form = e.target;
    const formId = form.id;
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput ? emailInput.value.trim() : '';
    if (emailInput) {
        emailInput.value = email;
    }
    const passwordInput = form.querySelector('input[type="password"]');
    const password = passwordInput ? passwordInput.value : null;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonHTML = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5 mx-auto"></i>`;
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }

    let operationSuccessful = false;

    try {
        switch (formId) {
            case 'login-form':
                await handleLogin(form, email, password);
                operationSuccessful = true;
                break;
            case 'register-form':
                await handleRegister(form, email, password);
                operationSuccessful = true;
                break;
            case 'reset-form':
                await handlePasswordReset(form, email);
                operationSuccessful = true;
                break;
        }
    } catch (error) {
        console.error("Authentication error:", error);
        let friendlyMessage = "Ocurrió un error inesperado.";
        switch (error.code || error.message) {
            case 'auth/invalid-login-credentials':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
            case 'auth/invalid-credential':
                friendlyMessage = 'Credenciales incorrectas. Por favor, verifique su email y contraseña.';
                break;
            case 'auth/missing-email':
            case 'auth/invalid-email':
                friendlyMessage = 'Ingresa un correo electrónico válido.';
                break;
            case 'auth/email-not-verified':
                friendlyMessage = 'Debe verificar su email para poder iniciar sesión. Revise su casilla de correo.';
                showAuthScreen('verify-email');
                break;
            case 'auth/email-already-in-use':
                friendlyMessage = 'Este correo electrónico ya está registrado. Intente iniciar sesión.';
                break;
            case 'auth/weak-password':
                friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
                break;
            case 'auth/missing-password':
                friendlyMessage = 'Ingresa una contraseña.';
                break;
            case 'auth/unauthorized-domain':
                friendlyMessage = 'Dominio no autorizado. Use un correo de @barackmercosul.com.';
                break;
            case 'auth/too-many-requests':
                 friendlyMessage = 'Demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.';
                 break;
            case 'auth/network-request-failed':
                 friendlyMessage = 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo nuevamente.';
                 break;
            default:
                friendlyMessage = 'Error de autenticación. Intente de nuevo más tarde.';
        }
        notify(friendlyMessage, 'error');
        operationSuccessful = false;
    }

    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonHTML;
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }

    if (formId === 'login-form' && operationSuccessful) {
        form.reset();
    }
}

export async function logOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        notify("Error al cerrar sesión.", "error");
    }
}

/**
 * Configura todos los manejadores de eventos para el módulo de autenticación.
 */
function setupEventListeners() {
    dom.loginForm?.addEventListener('submit', handleAuthForms);
    dom.registerForm?.addEventListener('submit', handleAuthForms);
    dom.resetForm?.addEventListener('submit', handleAuthForms);

    window.addEventListener('hashchange', handleAuthHashChange);

    const registerEmailInput = document.getElementById('register-email');
    if (registerEmailInput) {
        registerEmailInput.addEventListener('input', () => registerEmailInput.setCustomValidity(''));
        registerEmailInput.addEventListener('invalid', () => {
            if (registerEmailInput.validity.valueMissing) {
                registerEmailInput.setCustomValidity('Este campo es obligatorio.');
            } else if (registerEmailInput.validity.patternMismatch) {
                registerEmailInput.setCustomValidity('Introduce un correo corporativo válido @barackmercosul.com.');
            } else {
                registerEmailInput.setCustomValidity('');
            }
        });
    }

    // Utiliza un único listener en el documento para manejar clics en enlaces
    // y botones relacionados con la autenticación, mejorando el rendimiento.
    document.addEventListener('click', (e) => {
        const authLink = e.target.closest('a[data-auth-screen]');
        const logoutButton = e.target.closest(`#${DOM_ELEMENTS.logoutButton}`);
        const resendButton = e.target.closest(`#${DOM_ELEMENTS.resendVerificationBtn}`);

        if (authLink) {
            e.preventDefault();
            // Si el panel de verificación está visible, un clic en un enlace de autenticación
            // probablemente signifique que el usuario ha verificado y quiere volver a iniciar sesión.
            if (dom.verifyEmailPanel && !dom.verifyEmailPanel.classList.contains('hidden')) {
                location.reload();
            } else {
                showAuthScreen(authLink.dataset.authScreen);
            }
            return;
        }

        if (logoutButton) {
            e.preventDefault();
            logOutUser();
            return;
        }

        if (resendButton) {
            e.preventDefault();
            handleResendVerificationEmail();
        }
    });

    syncAuthScreenWithHash();
}


/**
 * Inicializa el módulo de autenticación.
 * Esta función es llamada desde `main.js` para configurar el módulo.
 * @param {*} _auth - La instancia de autenticación de Firebase.
 * @param {*} _db - La instancia de Firestore de Firebase.
 */
export function initAuthModule(_auth, _db, options = {}) {
    auth = _auth;
    db = _db;

    if (typeof options.showToast === 'function') {
        notify = options.showToast;
    } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        notify = window.showToast.bind(window);
    }

    setupEventListeners();

    console.log("Authentication module initialized.");
    window.showAuthScreen = showAuthScreen;
}
