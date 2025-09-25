import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { auth } from "./firebase.js";
import { showMessage } from "./showMessage.js";

const setupSignupForm = () => {
  const signupForm = document.querySelector("#signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = signupForm["signup-email"].value;
      const password = signupForm["signup-password"].value;

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        showMessage(`Welcome ${user.email}`);
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
  }
};

export { setupSignupForm };