> **Note to Human Developers:** This file is intended to provide guidance and instructions specifically for AI agents collaborating on this codebase. It is not general project documentation. For an overview of the project, please see `README.md`.

# Agent Guidelines

## Project Directives

### 1. AI Model Selection

*   **Directive:** The official and required AI model for all generative tasks in this project is **`gemini-2.5-flash-lite`**, accessed via the Google Cloud Vertex AI SDK.
*   **Reasoning:** This decision has been made to ensure consistency, predictable performance, and to avoid errors that could arise from switching between different models.
*   **Action:** Do not change this model or implement logic that uses other models (e.g., GPT, Claude, other Gemini versions) without explicit, multi-step confirmation from the user. This is a fixed technical requirement.


This file contains guidelines and lessons learned for AI agents working on this codebase.

## Lessons Learned

1.  **UI Placement:** Always confirm the location for new UI elements (e.g., menu items) if not explicitly specified. The "User Management" feature was initially placed in the "Configuración" menu, but the user preferred it in the "Gestión" menu. When in doubt, ask or place it in the most logical location and be prepared to move it.
2.  **Icon Verification:** Always verify that icon names (e.g., from the Lucide library) exist in the project's version of the library before using them. Using a non-existent icon like `users-cog` caused a console error. The correct icon was `user-cog`.
3.  **Proactive Communication on Data Changes:** When adding new fields to existing data structures (e.g., adding a `sector` to users), proactively explain to the user what will happen to existing data. Reassure them that their data is safe and explain how the application will handle records that don't have the new field (e.g., displaying "N/A").
4.  **Refactoring to Real-Time Listeners:** When refactoring code from a one-time fetch model (`getDocs`) to a real-time listener model (`onSnapshot`), it is crucial to remove any old, redundant calls to the data-fetching function. These manual calls can interfere with the real-time listeners and cause unpredictable behavior. The listener itself is responsible for all UI updates.
5.  **Firestore Index Requirements:** Complex queries, such as the `OR` query on the `tareas` collection combined with `orderBy`, require a composite index in Firestore. If a query fails silently or returns no data, always check the browser's developer console for a `FAILED_PRECONDITION` error. This error message contains a direct link to the Firebase console to automatically create the required index.
6.  **DOM Rendering Race Conditions:** A function that manipulates the DOM (e.g., `renderTasks`) can sometimes execute before the browser has finished painting the necessary elements, even if the `innerHTML` was set on a previous line. This can cause `querySelector` to return `null`. Deferring the function's execution with `setTimeout(callback, 0)` pushes it to the end of the event loop, ensuring the DOM is ready and solving the race condition.
7.  **Data Model Consistency:** The application relies on a consistent data model where all primary collection documents contain a unique `id` field. The `usuarios` collection was missing this field, causing generic table logic (sorting, editing) to fail. The fix involved not only updating the code to handle the inconsistency but, more importantly, migrating the existing data to enforce the consistent model.
8.  **Robust DOM Creation:** When creating a DOM node from an HTML string, using `document.createElement('template')` is more robust than the `createElement('div')` and `innerHTML` hack. The template method correctly handles complex HTML and is the modern standard.
9.  **Initial Seeding and Security Rules Deadlock:** When setting up the application with a clean database, a deadlock can occur. The application tries to seed default collections (like `roles` and `sectores`) on first login. However, the security rules require the user to be an 'admin' to write to these collections. The user cannot become an 'admin' because the `roles` collection doesn't exist yet to be selected from. The root cause is that the security rule function for checking write permissions (e.g., `canCreateUpdate`) might not correctly identify a "Super Admin" user (by UID) if their user document has a default role of 'lector'.
    *   **Solution:** The `canCreateUpdate` function in `firestore.rules` must be robust enough to handle this initial state. It should check for admin status using the same logic as the `isUserAdmin` function (i.e., checking for both role and the hardcoded Super Admin UID) in addition to any other roles like 'editor'. The correct procedure for a clean setup is:
        1.  Ensure the first user to log in has the UID designated as the Super Admin in the rules.
        2.  On first login, the application will create the user's document and correctly seed the initial data.
        3.  The Super Admin must then navigate to User Management and formally assign their own user the 'admin' role to ensure all admin features are available in the UI.
10. **Fixing Tutorial Highlighting on Dynamic Views:** When building interactive tutorials that highlight elements, two common issues can arise on dynamic, multi-page, or heavily-scripted forms:
    *   **Race Conditions with Scrolling:** Automated testing scripts (like Playwright) or fast user navigation can cause the tutorial to calculate an element's position *before* a smooth scroll animation has finished. This results in the highlight appearing in the wrong place.
        *   **Solution:** In the tutorial's scrolling logic (e.g., a function that calls `element.scrollIntoView()`), set the `behavior` option to `'instant'`. This eliminates the animation, ensuring the element is in its final position immediately.
    *   **Unstable Selectors:** If a tutorial step needs to highlight a concept represented by a group of dynamically generated elements (e.g., a list of department sections), applying a `data-tutorial-id` to only the *first* element is fragile. The tutorial may fail if that specific element is not visible or if the user navigates in a way that doesn't render it first.
        *   **Solution:** Instead of targeting a single dynamic item, wrap the entire group of related elements in a stable container `div`. Apply a single, consistent `data-tutorial-id` to this wrapper. Then, point all relevant tutorial steps (e.g., "Review Departments", "Approve Departments") to this single, stable wrapper. This makes the tutorial far more robust.
11. **Implementing Derived, Read-Only UI State:** When a UI element's state should be derived from other data (and not be directly user-editable), it is crucial to ensure this state is not accidentally persisted back to the database.
    *   **Scenario:** In the ECO form, the "Plan de acción completado" checkbox in the "Implementation" section should be checked *if and only if* all tasks in the Action Plan are marked as 'completed'. It should be a read-only indicator.
    *   **Problem:** The initial implementation correctly disabled the checkbox to prevent user clicks. However, the form-saving logic (`getFormData`) used a broad `querySelectorAll('input[type="checkbox"]')` to gather the state of all checkboxes. This read the `checked` property of the disabled checkbox and saved it to Firestore. If the user later reloaded the form with an incomplete action plan, `populateEcoForm` would read the stale `true` value from the database, incorrectly showing the box as checked before the runtime logic had a chance to correct it.
    *   **Solution:** The form-saving logic must be modified to exclude disabled elements. The most robust way to do this is to change the selector to `querySelectorAll('input[type="checkbox"]:not(:disabled)')`. This ensures that any UI element whose state is purely derived and therefore disabled will not have its state persisted, correctly treating it as a read-only, calculated field.
12. **Agent Workflow: Submit Before Verification.** Do not ask the user to verify a fix before the changes have been submitted. The user cannot see changes in the agent's sandboxed environment. The correct workflow is to complete the implementation, submit the code, and *then* inform the user that the changes are ready for their review and testing in their own environment.
14. **E2E Test Data Seeding and Authentication:** When writing Playwright E2E tests that require seeding data into Firestore, ensure the seeding process is triggered *after* the test user has successfully authenticated. Attempting to seed data before login will fail due to Firestore security rules, which require an authenticated user for most write operations. The correct pattern is to place the data seeding call within the `onAuthStateChanged` observer, after a user object is confirmed.
15. **Granting Collection-Wide Delete Permissions:** To allow a specific role (e.g., 'admin') to delete all documents within a collection (a "clean" operation), the Firestore security rules must explicitly grant `delete` permission on the collection's wildcard path (`/collection/{docId}`). A common mistake is to only grant `create` and `update` permissions, which will lead to "Missing or insufficient permissions" errors when a client-side cleanup function attempts to iterate and delete each document.
16. **Workflow for Backend Configuration Changes:** When a task requires changing a backend configuration file that is not automatically deployed (e.g., `firestore.rules`), the agent's responsibility is to modify the file and commit it to the repository. The agent must then explicitly inform the user that the change has been committed and provide the necessary command-line instructions (e.g., `firebase deploy --only firestore:rules`) for the user to deploy the configuration to their own environment. The agent must not ask for verification until after the code has been committed and the user has been given deployment instructions.
17. **3D Viewer Black Screen due to Renderer State Leak:** A "black screen" issue in the Three.js viewer, where only the axes gizmo was visible, was traced to a renderer state leak between frames.
    *   **Problem:** The function to render the axis gizmo would set the renderer's viewport and scissor to a small rectangle in the corner of the canvas. This state was not being reset. In the next animation frame, the main scene (rendered via `EffectComposer`) would inherit this tiny viewport and be rendered into an invisibly small area.
    *   **Solution:** The fix is to explicitly reset the renderer's state before rendering the main scene in each frame. In the `animate` loop, before calling `composer.render()`, add code to set the viewport and scissor back to the full dimensions of the main container. This ensures the main scene is always rendered to the correct area, regardless of what other rendering operations occurred in the previous frame.
18. **Debugging Refactoring-Induced Styling Issues:** When a block of HTML-generating code is moved from one file to another (e.g., from a main script into a separate module), it can lose its intended styling even if all CSS classes appear correct. This often happens because the styling depends on a parent context or a specific stylesheet that is no longer being applied.
    *   **Problem:** A task creation modal had a broken layout (elements "stuck together") after its rendering function was moved from `main.js` to `tasks.js`. Attempts to fix it by tweaking utility classes like `space-y-6` failed.
    *   **Debugging Strategy:** Instead of guessing, find a similar component in the application that is known to work correctly. In this case, the user pointed out that the login form's layout was correct.
    *   **Solution:** By inspecting the working login form's CSS (`auth.css`), it was discovered that it used a custom `auth-form` class with `display: flex` and `gap`. The broken task modal was updated to use this same class structure (`<form class="auth-form">` and wrapping fields in `<div class="input-group">`). This provided a robust, proven styling solution that was independent of any lost parent context, immediately fixing the layout. The key lesson is to **leverage existing, working components as a blueprint for fixing broken ones.**
19. **Replace Multi-Listener Workarounds with Native `or` Queries:** A persistent, hard-to-diagnose bug in the Task Dashboard was traced back to a fragile, client-side implementation of an `OR` query in the `task.service.js` module.
    *   **Problem:** To fetch tasks that were either *created by* or *assigned to* a user, the code set up two independent `onSnapshot` listeners and then attempted to merge the results in the client. This pattern is complex, inefficient, and prone to race conditions, leading to an unstable application state that affected other components, like the dashboard.
    *   **Solution:** The two listeners were replaced with a single, modern Firestore query using the native `or` operator: `query(tasksRef, or(where('assigneeUid', '==', user.uid), where('creatorUid', '==', user.uid)))`. This simplifies the code, improves performance, and eliminates the entire class of bugs related to client-side state merging.
    *   **Guideline:** Always prefer using native Firestore operators like `or` over complex client-side workarounds. If a query seems overly complicated to write or requires merging data from multiple listeners on the same collection, first check the latest Firestore documentation to see if a simpler, native solution exists.
20. **Differentiating AI Actions from Questions:** The AI assistant was initially designed only to execute task-modification commands. It now has the ability to differentiate between a command and a question.
    *   **Problem:** The user might ask "Which tasks are overdue?" expecting a simple answer, but the AI would try to interpret this as a command to modify tasks, leading to incorrect behavior.
    *   **Solution:** The AI's system prompt has been updated to recognize interrogative language. A new tool, `answer_question`, was introduced. When the AI determines the user's prompt is a question, it uses this tool to provide a direct textual answer and then finishes its execution, rather than attempting to build a task modification plan. This makes the assistant more versatile and user-friendly.

## Best Practices & Lessons Learned

### PDF Generation: `jsPDF` vs. `html2pdf.js`

*   **Directive:** For generating complex, multi-page PDFs from data (especially tables), the recommended approach is to use **`jsPDF` combined with the `jspdf-autotable` plugin**. This method is more robust and avoids rendering bugs.
*   **Warning:** The `html2pdf.js` library is **not recommended** for complex reports. It can fail silently (producing blank pages) when dealing with intricate HTML/CSS, such as elements with `position: absolute` or large base64-encoded images. Debugging these issues is time-consuming.
*   **Workflow:**
    1.  **Data Preparation:** Create a helper function (e.g., `prepareDataForPdfAutoTable`) to transform your data into the `head` and `body` format required by `jspdf-autotable`.
    2.  **Programmatic Generation:** Instantiate `jsPDF` and use `doc.autoTable()` to build the table. This allows for features like cover pages, headers, and footers with page numbers to be added programmatically.
    3.  **Dependency Check:** Always ensure that the `jspdf.umd.min.js` and `jspdf.plugin.autotable.min.js` scripts are correctly loaded in `index.html`. A `TypeError` related to an undefined `window.jspdf` object is a clear indicator that these scripts are missing.

### Deployment & Versioning: Notifying Users of Updates

*   **Directive:** This system uses Firestore and a Cloud Function to automatically notify all users of a new version. The old manual system based on `version.json` has been deprecated and removed.

#### Core Components
1.  **`versiones` Collection (Firestore):** This collection stores version documents. Each document contains a `versionTag` (e.g., "v2.1.0"), `notes` (in Markdown), `releaseDate`, and `publishedBy`.
2.  **Version Management UI (`public/modules/admin/versions.js`):** A dedicated page, accessible only to administrators, for creating and publishing new version announcements.
3.  **`onVersionCreate` Cloud Function (`functions/index.js`):** This function is triggered when a new document is created in the `versiones` collection. It automatically iterates through all active users and creates a new document for each one in the `notifications` collection.
4.  **Frontend Notification Handling (`public/main.js`):** The main application script listens for notifications. When a user clicks a notification with `view: 'version_release'`, it calls the `showVersionReleaseModal` function, which fetches the version details and displays the release notes in a modal.

#### Correct Workflow for Releasing a New Version
The process is now fully managed within the application's UI and backend.

1.  **Deploy Code Changes:** Deploy all new features and bug fixes to the production environment (e.g., `firebase deploy`).
2.  **Publish Announcement:**
    *   An administrator navigates to the "Gestión de Versiones" page in the "Configuración" menu.
    *   The admin fills in the "Etiqueta de la Versión" (e.g., `v2.1.0`) and the "Notas de la Versión" using Markdown.
    *   Clicking "Publicar Versión" creates a new document in the `versiones` collection.
3.  **Automatic Notification:**
    *   The `onVersionCreate` Cloud Function triggers automatically.
    *   It sends a notification to every active user's notification center (bell icon).
    *   Users can click the notification to view the release notes.

*   **Summary:** The release process is decoupled from git commits. Admins can announce new versions at any time through the UI, and the system handles the notification distribution automatically.

### General Technical Details

*   **Note on E2E Testing with Playwright (As of 2025-09-02):** The Playwright E2E test suite has been temporarily disabled by renaming `playwright.config.js` to `playwright.config.js.disabled`.
    *   **Reason:** The tests were running against a live, data-heavy Firebase instance, causing them to be extremely slow and unreliable. This was causing significant developer friction.
    *   **Do not re-enable without a proper test data strategy.**
    *   **Recommendation:** Before re-enabling, implement a solution to either (a) connect to a dedicated, clean test database seeded with minimal, specific data for each test run, or (b) mock the Firestore data layer for the E2E tests, similar to how it's done for the Jest unit tests. This will ensure tests are fast, deterministic, and do not rely on the state of a live database.

*   **Real-Time by Default:** The application heavily uses real-time Firestore listeners (`onSnapshot`). Assume that when data is changed, the relevant UI will update automatically. Do not add manual refresh/refetch calls after creating, updating, or deleting data.
*   **Admin-Only Features:** Some features are restricted to administrators. The user's role is stored in `appState.currentUser.role`. Check for `appState.currentUser.role === 'admin'` to conditionally show UI elements.
*   **Form Modals:** The `openFormModal` function is generic and driven by the `viewConfig` object. It can be extended to support new field types and configurations.
*   **Styling:** The project uses TailwindCSS. All new UI should conform to this styling.
*   **Icons:** The project uses the Lucide icon library. Refer to the official Lucide website for a list of available icons.

## Estructura del Proyecto

### Módulo de Visualización 3D

Para mantener el módulo de visualización 3D organizado y escalable, todos los archivos relacionados deben colocarse en la siguiente estructura de carpetas dentro de `public/modulos/visor3d/`:

-   **`js/`**: Contiene los archivos JavaScript principales del visor, como `visor3d.js`.
-   **`css/`**: Contiene las hojas de estilo específicas para el visor, como `visor3d.css`.
-   **`modelos/`**: Almacena todos los modelos 3D (archivos `.glb`, `.gltf`, etc.). Se recomienda crear subcarpetas para una mejor organización (por ejemplo, `modelos/autos/`, `modelos/piezas/`).
-   **`imagenes/`**: Contiene todas las imágenes y texturas utilizadas por el visor 3D.

Al agregar nuevos recursos, es fundamental seguir esta estructura para asegurar que el código siga siendo fácil de mantener.

## Development Credentials

To run the application and verify frontend changes, use the following credentials for login:

- **Username:** `f.santoro@barackmercosul.com`
- **Password:** `$oof@k24`
---
