import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { auth } from "./firebase.js";
import { getActiveUserProfile } from "./firestore.js";
import { showMessage } from "./showMessage.js";

// Forms
import { setupLoginForm } from "./loginForm.js";
import { setupSignupForm } from "./signupForm.js";
import { setupResetForm } from "./resetForm.js";

// Controllers
import { setupUsersController } from "./modules/users/js/users-controller.js";

const loggedOutLinks = document.querySelectorAll(".logged-out");
const loggedInLinks = document.querySelectorAll(".logged-in");
const userName = document.querySelector("#user-name");
const userProfile = document.querySelector("#user-profile");
const mainContent = document.querySelector("#main-content");
const pageTitle = document.querySelector("#page-title");
const breadcrumb = document.querySelector("#breadcrumb");

let activeView = null;
let activeData = null;
let activeUser = null;

// Function to switch between views
const switchView = (view, data) => {
  activeView = view;
  activeData = data;
  mainContent.innerHTML = "";
  switch (view) {
    case "login":
      pageTitle.innerHTML = "Login";
      breadcrumb.innerHTML = `<li class="breadcrumb-item active" aria-current="page">Login</li>`;
      mainContent.innerHTML = `
        <div class="row">
          <div class="col-md-6 offset-md-3">
            <div class="card">
              <div class="card-body">
                <h2 class="card-title text-center">Login</h2>
                <form id="login-form">
                  <div class="mb-3">
                    <label for="login-email" class="form-label">Email</label>
                    <input type="email" class="form-control" id="login-email" required>
                  </div>
                  <div class="mb-3">
                    <label for="login-password" class="form-label">Password</label>
                    <input type="password" class="form-control" id="login-password" required>
                  </div>
                  <div class="d-grid">
                    <button type="submit" class="btn btn-primary">Login</button>
                  </div>
                </form>
                <div class="mt-3 text-center">
                  <a href="#" id="reset-password-link">Forgot Password?</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      setupLoginForm();
      const resetPasswordLink = document.querySelector("#reset-password-link");
      if (resetPasswordLink) {
        resetPasswordLink.addEventListener("click", (e) => {
          e.preventDefault();
          switchView("reset");
        });
      }
      break;
    case "signup":
      pageTitle.innerHTML = "Signup";
      breadcrumb.innerHTML = `<li class="breadcrumb-item active" aria-current="page">Signup</li>`;
      mainContent.innerHTML = `
        <div class="row">
          <div class="col-md-6 offset-md-3">
            <div class="card">
              <div class="card-body">
                <h2 class="card-title text-center">Signup</h2>
                <form id="signup-form">
                  <div class="mb-3">
                    <label for="signup-email" class="form-label">Email</label>
                    <input type="email" class="form-control" id="signup-email" required>
                  </div>
                  <div class="mb-3">
                    <label for="signup-password" class="form-label">Password</label>
                    <input type="password" class="form-control" id="signup-password" required>
                  </div>
                  <div class="d-grid">
                    <button type="submit" class="btn btn-primary">Signup</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;
      setupSignupForm();
      break;
    case "reset":
      pageTitle.innerHTML = "Reset Password";
      breadcrumb.innerHTML = `<li class="breadcrumb-item active" aria-current="page">Reset Password</li>`;
      mainContent.innerHTML = `
        <div class="row">
          <div class="col-md-6 offset-md-3">
            <div class="card">
              <div class="card-body">
                <h2 class="card-title text-center">Reset Password</h2>
                <form id="reset-form">
                  <div class="mb-3">
                    <label for="reset-email" class="form-label">Email</label>
                    <input type="email" class="form-control" id="reset-email" required>
                  </div>
                  <div class="d-grid">
                    <button type="submit" class="btn btn-primary">Send Reset Link</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;
      setupResetForm();
      break;
    case "users":
      pageTitle.innerHTML = "Users";
      breadcrumb.innerHTML = `<li class="breadcrumb-item active" aria-current="page">Users</li>`;
      mainContent.innerHTML = `
        <div class="card">
          <div class="card-body">
            <h2 class="card-title">Users</h2>
            <div class="table-responsive">
              <table id="users-table" class="table table-striped">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      setupUsersController();
      break;
    default:
      pageTitle.innerHTML = "Dashboard";
      breadcrumb.innerHTML = `<li class="breadcrumb-item active" aria-current="page">Dashboard</li>`;
      mainContent.innerHTML = `
        <div class="row">
          <div class="col-md-12">
            <div class="card">
              <div class="card-body">
                <h2 class="card-title">Welcome to the Dashboard</h2>
                <p>Select an option from the sidebar to get started.</p>
              </div>
            </div>
          </div>
        </div>
      `;
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userProfileData = await getActiveUserProfile(user);
    activeUser = { ...user, ...userProfileData };
    if (userName && activeUser.name) {
      userName.innerHTML = activeUser.name;
    } else if (userName) {
      userName.innerHTML = activeUser.email;
    }
    if (userProfile) {
      userProfile.style.display = "block";
    }
    loggedInLinks.forEach((item) => (item.style.display = "block"));
    loggedOutLinks.forEach((item) => (item.style.display = "none"));
    if (activeView === null || activeView === "login" || activeView === "signup" || activeView === "reset") {
      switchView("dashboard");
    } else {
      switchView(activeView, activeData);
    }
  } else {
    activeUser = null;
    if (userProfile) {
      userProfile.style.display = "none";
    }
    loggedInLinks.forEach((item) => (item.style.display = "none"));
    loggedOutLinks.forEach((item) => (item.style.display = "block"));
    switchView("login");
  }
});

const logout = document.querySelector("#logout");
if (logout) {
  logout.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await signOut(auth);
      showMessage("Logged out successfully");
    } catch (error) {
      console.log(error);
      showMessage(error.message, "error");
    }
  });
}

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-view]")) {
    e.preventDefault();
    const view = e.target.getAttribute("data-view");
    switchView(view);
  }
});