import { jest, describe, beforeEach, test, expect } from '@jest/globals';

jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js');
jest.mock('../../public/modules/landing_page.tasks.templates.js', () => {
  const minimalTaskFormHTML = (
    task, defaultStatus, selectedUid
  ) => `
    <div id="task-form-modal">
      <form id="task-form">
        <button type="submit">Guardar</button>
        <button type="button" data-action="close">Cerrar</button>
      </form>
      <select id="task-assignee" data-selected-uid="${selectedUid || ''}"></select>
      <div id="subtasks-list"></div>
      <input id="new-subtask-title" />
      <div id="task-comments-list"></div>
      <textarea id="new-task-comment"></textarea>
      <button id="post-comment-btn"></button>
    </div>
  `;

  return {
    getTaskFormModalHTML: jest.fn((task, defaultStatus, selectedUid) => minimalTaskFormHTML(task, defaultStatus, selectedUid)),
    getSubtaskHTML: jest.fn(() => '<div class="subtask-item" data-subtask-id="sub_1"><input class="subtask-checkbox" type="checkbox" /></div>'),
    getAIChatModalHTML: jest.fn(() => '<div id="ai-assistant-modal"></div>'),
    getAIChatMessageHTML: jest.fn(() => '<div class="ai-message"></div>'),
    getAILoadingMessageHTML: jest.fn(() => '<div id="ai-loading-bubble"></div>'),
    getAIAssistantReviewViewHTML: jest.fn(() => '<div id="ai-review"></div>'),
    getAIAssistantExecutionProgressViewHTML: jest.fn(() => '<div id="ai-execution"></div>'),
    getPlannerHelpModalHTML: jest.fn(() => '<div id="planner-help-modal"><button data-action="close">Cerrar</button></div>'),
    getTasksModalHTML: jest.fn(() => '<div id="tasks-modal"></div>'),
  };
});

import { collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

import * as landingTasks from '../../public/modules/landing_page.tasks.js';
import { COLLECTIONS } from '../../public/utils.js';
import { getTaskFormModalHTML, getPlannerHelpModalHTML } from '../../public/modules/landing_page.tasks.templates.js';

const { initLandingTasksHelper, openTaskFormModal, completeAndArchiveTask, updateTaskBlockedStatus, fetchAllTasks, showPlannerHelpModal } = landingTasks;

describe('Landing page tasks helper', () => {
  let dependencies;

  beforeEach(() => {
    jest.clearAllMocks();

    document.body.innerHTML = '<div id="modal-root"></div>';
    const modalContainer = document.createElement('div');
    modalContainer.id = 'modal-container';
    document.body.appendChild(modalContainer);

    collection.mockReturnValue('collection-ref');
    orderBy.mockReturnValue('order-by-createdAt');
    query.mockReturnValue('query-ref');
    onSnapshot.mockReturnValue(() => {});
    doc.mockImplementation((dbArg, collectionArg, docIdArg) => ({ dbArg, collectionArg, docIdArg }));
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockResolvedValue();

    dependencies = {
      db: { name: 'mock-db' },
      functions: {},
      appState: {
        currentUser: { uid: 'user-1', role: 'member' },
        collections: {
          [COLLECTIONS.USUARIOS]: [
            { docId: 'user-1', name: 'Alice' },
            { docId: 'user-2', name: 'Bob' },
          ],
        },
        collectionsById: {
          [COLLECTIONS.USUARIOS]: new Map([
            ['user-1', { docId: 'user-1', name: 'Alice' }],
            ['user-2', { docId: 'user-2', name: 'Bob' }],
          ]),
        },
      },
      dom: { modalContainer },
      lucide: { createIcons: jest.fn() },
      showToast: jest.fn(),
      showConfirmationModal: jest.fn(),
    };

    initLandingTasksHelper(dependencies);
  });

  test('openTaskFormModal fetches dependency details and restricts assignee for non-admins', async () => {
    const task = {
      docId: 'task-1',
      title: 'Tarea crítica',
      dependsOn: ['task-2'],
      blocks: ['task-3'],
      status: 'in_progress',
    };

    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'task-2', data: () => ({ title: 'Preparar informe' }) },
        { id: 'task-3', data: () => ({ title: 'Revisar documentación' }) },
      ],
    });

    await openTaskFormModal(task);

    expect(getDocs).toHaveBeenCalledTimes(1);
    const [taskArg, , selectedUid, , isAdmin] = getTaskFormModalHTML.mock.calls.at(-1);
    expect(taskArg.dependsOnDetails).toEqual([{ docId: 'task-2', title: 'Preparar informe' }]);
    expect(taskArg.blocksDetails).toEqual([{ docId: 'task-3', title: 'Revisar documentación' }]);
    expect(selectedUid).toBe('user-1');
    expect(isAdmin).toBe(false);

    const assigneeSelect = document.getElementById('task-assignee');
    expect(assigneeSelect.disabled).toBe(true);
    expect(assigneeSelect.value).toBe('user-1');
  });

  test('completeAndArchiveTask marks the task as done and archived', async () => {
    await completeAndArchiveTask('task-42');

    expect(doc).toHaveBeenCalledWith(dependencies.db, COLLECTIONS.TAREAS, 'task-42');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, updatePayload] = updateDoc.mock.calls[0];
    expect(updatePayload).toMatchObject({ status: 'done', isArchived: true });
    expect(updatePayload.completedAt).toBeInstanceOf(Date);
  });

  test('updateTaskBlockedStatus forwards the blocked state to Firestore', async () => {
    await updateTaskBlockedStatus('task-55', true);

    expect(doc).toHaveBeenCalledWith(dependencies.db, COLLECTIONS.TAREAS, 'task-55');
    expect(updateDoc).toHaveBeenCalledWith(expect.any(Object), { blocked: true });
  });

  test('fetchAllTasks maps Firestore documents to task objects', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { id: 'task-1', data: () => ({ title: 'Planificar' }) },
        { id: 'task-2', data: () => ({ title: 'Construir' }) },
      ],
    });

    const tasks = await fetchAllTasks();

    expect(collection).toHaveBeenCalledWith(dependencies.db, COLLECTIONS.TAREAS);
    expect(query).toHaveBeenCalledWith('collection-ref');
    expect(tasks).toEqual([
      { docId: 'task-1', title: 'Planificar' },
      { docId: 'task-2', title: 'Construir' },
    ]);
  });

  test('showPlannerHelpModal renders the modal and wires close action', () => {
    const modalElement = showPlannerHelpModal();

    expect(getPlannerHelpModalHTML).toHaveBeenCalledTimes(1);
    expect(dependencies.dom.modalContainer.innerHTML).toContain('planner-help-modal');

    const closeButton = modalElement.querySelector('[data-action="close"]');
    closeButton.click();

    expect(document.getElementById('planner-help-modal')).toBeNull();
  });
});
