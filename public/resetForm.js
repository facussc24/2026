import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { auth } from "./firebase.js";
import { showMessage } from "./showMessage.js";

const setupResetForm = () => {
  const resetForm = document.querySelector("#reset-form");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = resetForm["reset-email"].value;

      try {
        await sendPasswordResetEmail(auth, email);
        showMessage("Password reset email sent. Please check your inbox.");
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
  }
};

export { setupResetForm };