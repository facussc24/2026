// public/auth.js

// Firebase imports needed for auth
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from './utils.js';

// These will be initialized by main.js
let auth;
let db;

// This is not ideal, but for a simple refactor it's ok.
// A better way would be to pass them in or have a central dom mapping.
const dom = {
    loginPanel: document.getElementById('login-panel'),
    registerPanel: document.getElementById('register-panel'),
    resetPanel: document.getElementById('reset-panel'),
    verifyEmailPanel: document.getElementById('verify-email-panel'),
    resendVerificationBtn: document.getElementById('resend-verification-btn'),
    resendTimer: document.getElementById('resend-timer'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    resetForm: document.getElementById('reset-form')
};


export function showAuthScreen(screenName) {
    ['login-panel', 'register-panel', 'reset-panel', 'verify-email-panel'].forEach(id => {
        const panel = document.getElementById(id);
        if(panel) panel.classList.add('hidden');
    });
    const panelToShow = document.getElementById(`${screenName}-panel`);
    if(panelToShow) panelToShow.classList.remove('hidden');
}

async function handleResendVerificationEmail() {
    if (!dom.resendVerificationBtn || !dom.resendTimer || dom.resendVerificationBtn.disabled) return;

    dom.resendVerificationBtn.disabled = true;
    dom.resendTimer.textContent = 'Enviando...';

    try {
        await sendEmailVerification(auth.currentUser);
        window.showToast('Se ha enviado un nuevo correo de verificación.', 'success');

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
        window.showToast(friendlyMessage, 'error');
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
    window.showToast('¡Registro exitoso! Revisa tu correo para verificar tu cuenta.', 'success');
    showAuthScreen('verify-email');
}

async function handlePasswordReset(form, email) {
    await sendPasswordResetEmail(auth, email);
    window.showToast(`Si la cuenta ${email} existe, se ha enviado un enlace para restablecer la contraseña.`, 'info');
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
        window.showToast(friendlyMessage, 'error');

        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHTML;
    }
}

export async function logOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        window.showToast("Error al cerrar sesión.", "error");
    }
}


export function initAuthModule(_auth, _db) {
    auth = _auth;
    db = _db;

    dom.loginForm?.addEventListener('submit', handleAuthForms);
    dom.registerForm?.addEventListener('submit', handleAuthForms);
    dom.resetForm?.addEventListener('submit', handleAuthForms);

    // This is in main.js, but it's part of the auth flow
    document.addEventListener('click', (e) => {
        const authLink = e.target.closest('a[data-auth-screen]');
        if (authLink) {
            e.preventDefault();
            const verifyPanel = document.getElementById('verify-email-panel');
            if (verifyPanel && !verifyPanel.classList.contains('hidden')) {
                location.reload();
            } else {
                showAuthScreen(authLink.dataset.authScreen);
            }
            return;
        }

        if(e.target.closest('#logout-button')) {
            e.preventDefault();
            logOutUser();
        }
        if(e.target.closest('#resend-verification-btn')) {
            handleResendVerificationEmail();
        }
    });

    console.log("Authentication module initialized.");
}
