// public/auth.js

// Firebase imports needed for auth
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from './utils.js';
import { showToast } from './modules/shared/ui.js';

// These will be initialized by main.js
let auth;
let db;

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

export function showAuthScreen(screenName) {
    const screens = [
        DOM_ELEMENTS.loginPanel,
        DOM_ELEMENTS.registerPanel,
        DOM_ELEMENTS.resetPanel,
        DOM_ELEMENTS.verifyEmailPanel
    ];

    screens.forEach(id => {
        const panel = document.getElementById(id);
        if (panel) panel.classList.add('hidden');
    });

    const panelToShow = document.getElementById(`${screenName}-panel`);
    if (panelToShow) panelToShow.classList.remove('hidden');
}

async function handleResendVerificationEmail() {
    if (!dom.resendVerificationBtn || !dom.resendTimer || dom.resendVerificationBtn.disabled) return;

    dom.resendVerificationBtn.disabled = true;
    dom.resendTimer.textContent = 'Enviando...';

    try {
        await sendEmailVerification(auth.currentUser);
        showToast('Se ha enviado un nuevo correo de verificación.', 'success');

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
        showToast(friendlyMessage, 'error');
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
    const name = form.querySelector('#register-name').value;
    if (!email.toLowerCase().endsWith('@barackmercosul.com')) {
        throw new Error('auth/unauthorized-domain');
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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
    showToast('¡Registro exitoso! Revisa tu correo para verificar tu cuenta.', 'success');
    showAuthScreen('verify-email');
}

async function handlePasswordReset(form, email) {
    await sendPasswordResetEmail(auth, email);
    showToast(`Si la cuenta ${email} existe, se ha enviado un enlace para restablecer la contraseña.`, 'info');
    showAuthScreen('login');
}

export async function handleAuthForms(e) {
    e.preventDefault();
    const form = e.target;
    const formId = form.id;
    const email = form.querySelector('input[type="email"]').value;
    const passwordInput = form.querySelector('input[type="password"]');
    const password = passwordInput ? passwordInput.value : null;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonHTML = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5 mx-auto"></i>`;
    window.lucide.createIcons();

    try {
        switch (formId) {
            case 'login-form':
                await handleLogin(form, email, password);
                break;
            case 'register-form':
                await handleRegister(form, email, password);
                break;
            case 'reset-form':
                await handlePasswordReset(form, email);
                break;
        }
    } catch (error) {
        console.error("Authentication error:", error);
        let friendlyMessage = "Ocurrió un error inesperado.";
        switch (error.code || error.message) {
            case 'auth/invalid-login-credentials':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                friendlyMessage = 'Credenciales incorrectas. Por favor, verifique su email y contraseña.';
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
            case 'auth/unauthorized-domain':
                friendlyMessage = 'Dominio no autorizado. Use un correo de @barackmercosul.com.';
                break;
            case 'auth/too-many-requests':
                 friendlyMessage = 'Demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.';
                 break;
            default:
                friendlyMessage = 'Error de autenticación. Intente de nuevo más tarde.';
        }
        showToast(friendlyMessage, 'error');

        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHTML;
    }
}

export async function logOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        showToast("Error al cerrar sesión.", "error");
    }
}

/**
 * Configura todos los manejadores de eventos para el módulo de autenticación.
 */
function setupEventListeners() {
    dom.loginForm?.addEventListener('submit', handleAuthForms);
    dom.registerForm?.addEventListener('submit', handleAuthForms);
    dom.resetForm?.addEventListener('submit', handleAuthForms);

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
}


/**
 * Inicializa el módulo de autenticación.
 * Esta función es llamada desde `main.js` para configurar el módulo.
 * @param {*} _auth - La instancia de autenticación de Firebase.
 * @param {*} _db - La instancia de Firestore de Firebase.
 */
export function initAuthModule(_auth, _db) {
    auth = _auth;
    db = _db;

    setupEventListeners();

    console.log("Authentication module initialized.");
}
