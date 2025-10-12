const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const {VertexAI} = require("@google-cloud/vertexai");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');
const crypto = require("crypto");

const DEFAULT_AI_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const capitalizeFirstLetter = (value = '') => {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
};

const getCurrentDateForUserTZ = ({ date = new Date(), timeZone = DEFAULT_AI_TIME_ZONE } = {}) => {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
};

const normalizePlannedDate = (plannedDate, timeZone = DEFAULT_AI_TIME_ZONE) => {
    if (!plannedDate || typeof plannedDate !== 'string') {
        return { normalizedDate: plannedDate, wasAdjusted: false };
    }

    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRegex.test(plannedDate)) {
        return { normalizedDate: plannedDate, wasAdjusted: false };
    }

    const [year, month, day] = plannedDate.split('-').map(Number);
    const baseDate = new Date(Date.UTC(year, month - 1, day, 12));

    if (Number.isNaN(baseDate.getTime())) {
        return { normalizedDate: plannedDate, wasAdjusted: false };
    }

    const weekdayFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone });
    const weekdayAbbrFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone });
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone });

    const originalWeekday = capitalizeFirstLetter(weekdayFormatter.format(baseDate));
    const dayOfWeek = weekdayAbbrFormatter.format(baseDate);

    let daysToAdd = 0;
    if (dayOfWeek === 'Sat') {
        daysToAdd = 2;
    } else if (dayOfWeek === 'Sun') {
        daysToAdd = 1;
    }

    if (daysToAdd === 0) {
        return {
            normalizedDate: dateFormatter.format(baseDate),
            wasAdjusted: false,
            originalDate: plannedDate,
            originalWeekday,
            normalizedWeekday: originalWeekday,
            adjustedByDays: 0,
        };
    }

    const adjustedDate = new Date(baseDate.getTime());
    adjustedDate.setUTCDate(adjustedDate.getUTCDate() + daysToAdd);
    const normalizedDate = dateFormatter.format(adjustedDate);
    const normalizedWeekday = capitalizeFirstLetter(weekdayFormatter.format(adjustedDate));

    return {
        normalizedDate,
        wasAdjusted: true,
        originalDate: plannedDate,
        originalWeekday,
        normalizedWeekday,
        adjustedByDays: daysToAdd,
    };
};

const SPANISH_MONTHS = {
    'enero': 1,
    'febrero': 2,
    'marzo': 3,
    'abril': 4,
    'mayo': 5,
    'junio': 6,
    'julio': 7,
    'agosto': 8,
    'septiembre': 9,
    'setiembre': 9,
    'octubre': 10,
    'noviembre': 11,
    'diciembre': 12,
};

const extractExplicitDatesFromPrompt = (userPrompt = '', { timeZone = DEFAULT_AI_TIME_ZONE, baseDate = new Date() } = {}) => {
    if (!userPrompt || typeof userPrompt !== 'string') {
        return [];
    }

    const results = [];
    const seenIsoDates = new Set();
    const normalizedPrompt = userPrompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const referenceDateString = getCurrentDateForUserTZ({ date: baseDate, timeZone });
    const [referenceYear, referenceMonth, referenceDay] = referenceDateString.split('-').map(Number);
    const referenceDateUtc = new Date(Date.UTC(referenceYear, referenceMonth - 1, referenceDay, 12));

    const formatCandidateDate = (year, month, day, originalText, { isYearFixed = false } = {}) => {
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return;
        }

        let candidateYear = year;
        let candidate = new Date(Date.UTC(candidateYear, month - 1, day, 12));
        if (Number.isNaN(candidate.getTime())) {
            return;
        }

        let rolledToFuture = false;
        if (!isYearFixed && candidate < referenceDateUtc) {
            const nextYearCandidate = new Date(Date.UTC(candidateYear + 1, month - 1, day, 12));
            if (!Number.isNaN(nextYearCandidate.getTime())) {
                candidate = nextYearCandidate;
                candidateYear += 1;
                rolledToFuture = true;
            }
        }

        const isoFormatter = new Intl.DateTimeFormat('en-CA', { timeZone });
        const isoDate = isoFormatter.format(candidate);
        if (seenIsoDates.has(isoDate)) {
            return;
        }

        seenIsoDates.add(isoDate);
        results.push({
            originalText: originalText.trim(),
            isoDate,
            year: candidateYear,
            month,
            day,
            rolledToFuture,
        });
    };

    const isoDateRegex = /\b(\d{4})[\/-](\d{2})[\/-](\d{2})\b/g;
    const isoSpans = [];
    let isoMatch;
    while ((isoMatch = isoDateRegex.exec(userPrompt)) !== null) {
        const [, yearRaw, monthRaw, dayRaw] = isoMatch;
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        const day = Number(dayRaw);
        isoSpans.push({ start: isoMatch.index, end: isoMatch.index + isoMatch[0].length });
        formatCandidateDate(year, month, day, isoMatch[0], { isYearFixed: true });
    }

    const numericDateRegex = /(?<!\d)(\d{1,2})[\/-](\d{1,2})(?!\d)/g;
    let numericMatch;
    while ((numericMatch = numericDateRegex.exec(userPrompt)) !== null) {
        const matchStart = numericMatch.index;
        const matchEnd = matchStart + numericMatch[0].length;
        const overlapsIso = isoSpans.some(({ start, end }) => matchStart < end && matchEnd > start);
        if (overlapsIso) {
            continue;
        }

        const [, dayRaw, monthRaw] = numericMatch;
        const day = Number(dayRaw);
        const month = Number(monthRaw);
        formatCandidateDate(referenceYear, month, day, numericMatch[0]);
    }

    const textualDateRegex = /(\d{1,2})\s+de\s+([a-zñ]+)(?:\s+de\s+(\d{4}))?/gi;
    let textualMatch;
    while ((textualMatch = textualDateRegex.exec(normalizedPrompt)) !== null) {
        const [, dayRaw, monthText, yearRaw] = textualMatch;
        const day = Number(dayRaw);
        const month = SPANISH_MONTHS[monthText];
        if (!month) {
            continue;
        }
        const candidateYear = yearRaw ? Number(yearRaw) : referenceYear;
        const originalTextStart = textualMatch.index;
        const originalText = userPrompt.substring(originalTextStart, originalTextStart + textualMatch[0].length);
        formatCandidateDate(candidateYear, month, day, originalText, { isYearFixed: Boolean(yearRaw) });
    }

    return results;
};

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.getNextEcrNumber = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  const db = admin.firestore();
  const counterRef = db.collection("counters").doc("ecr_counter");

  try {
    const newEcrNumber = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const currentYear = new Date().getFullYear();
      let nextNumber = 1;

      if (counterSnap.exists) {
        const counterData = counterSnap.data();
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }

      transaction.set(
          counterRef,
          {count: nextNumber, year: currentYear},
          {merge: true},
      );

      return `ECR-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
    });

    return {ecrNumber: newEcrNumber};
  } catch (error) {
    console.error("Error generating ECR number:", error);
    throw new functions.https.HttpsError(
        "internal",
        "An error occurred while generating the ECR number.",
    );
  }
});

exports.saveFormWithValidation = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // 1. Manual Authentication
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'The function must be called while authenticated.' }
        });
      }
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email || 'Unknown';

      // 2. Data Parsing (from req.body.data for callable compatibility)
      const { formType, formData } = req.body.data;
      if (!formType || !formData) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The function must be called with "formType" and "formData" arguments.' }
        });
      }

      // --- ECR Validation ---
      if (formType === 'ecr') {
        const requiredFields = [
            { key: 'denominacion_producto', label: 'Denominación del Producto' },
            { key: 'situacion_existente', label: 'Situación Existente' },
            { key: 'situacion_propuesta', label: 'Situación Propuesta' }
        ];

        for (const field of requiredFields) {
            if (!formData[field.key] || formData[field.key].trim() === '') {
              return res.status(400).json({
                error: { status: 'INVALID_ARGUMENT', message: `El campo "${field.label}" no puede estar vacío.` }
              });
            }
        }
      }

      // --- ECO Validation ---
      else if (formType === 'eco') {
        if (!formData['ecr_no'] || formData['ecr_no'].trim() === '') {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El campo "ECR N°" no puede estar vacío.' }
          });
        }
        // Add safety checks for comments and checklists
        const hasComments = formData.comments && Object.values(formData.comments).some(comment => comment && comment.trim() !== '');
        const hasChecklists = formData.checklists && Object.values(formData.checklists).some(section =>
            section && section.some(item => item && (item.si || item.na))
        );

        if (!hasComments && !hasChecklists) {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El formulario ECO está vacío. Agregue al menos un comentario o marque una opción en el checklist.' }
          });
        }
      } else {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'El "formType" debe ser "ecr" o "eco".' }
        });
      }

      // --- Firestore Write Logic ---
      const db = admin.firestore();
      const collectionName = formType === 'ecr' ? 'ecr_forms' : 'eco_forms';

      // ECR number is now generated client-side.
      // The function now assumes the 'id' field is always present.
      const docId = formData.id;
      if (!docId) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The document ID is missing from the form data.' }
        });
      }

      const docRef = db.collection(collectionName).doc(docId);
      const historyRef = docRef.collection('history');

      const dataToSave = {
          ...formData,
          lastModified: new Date(),
          modifiedBy: userEmail,
          serverValidated: true
      };

      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;

      const batch = db.batch();
      batch.set(docRef, dataToSave, { merge: true });

      const historyDocRef = historyRef.doc();
      batch.set(historyDocRef, dataToSave);

      await batch.commit();

      // --- Email Notification Logic ---
      const newStatus = dataToSave.status;
      const oldStatus = oldData ? oldData.status : null;

      if (newStatus && newStatus !== oldStatus) {
        const creatorUid = dataToSave.creatorUid;
        if (creatorUid) {
          try {
            const userRecord = await admin.auth().getUser(creatorUid);
            const email = userRecord.email;
            if (email) {
              const mailOptions = {
                from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Actualización de Estado: ${formType.toUpperCase()} ${docId}`,
                html: `
                  <p>Hola,</p>
                  <p>El estado de tu <strong>${formType.toUpperCase()} ${docId}</strong> ha cambiado de <strong>${oldStatus || 'N/A'}</strong> a <strong>${newStatus}</strong>.</p>
                  <p>Puedes ver los detalles en la aplicación.</p>
                  <p>Saludos,<br>El equipo de Gestión PRO</p>
                `
              };
              await transporter.sendMail(mailOptions);
              console.log(`Email sent to ${email} for ${formType.toUpperCase()} ${docId} status change.`);
            }
          } catch (error) {
            console.error(`Failed to send email for ${formType.toUpperCase()} ${docId}:`, error);
          }
        }
      }

      // 3. Manual Response Formatting
      return res.status(200).json({
        data: { success: true, message: `${formType.toUpperCase()} guardado con éxito.` }
      });

    } catch (error) {
      console.error(`Error in saveFormWithValidation for ${req.body?.data?.formType}:`, error);
      // Handle auth errors specifically
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'Authentication token is invalid or expired.' }
        });
      }
      // Generic internal error for all other cases
      return res.status(500).json({
        error: { status: 'INTERNAL', message: `An internal error occurred while saving the form.` }
      });
    }
  });
});

exports.sendTaskAssignmentEmail = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .firestore.document('tareas/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    const assigneeUid = task.assigneeUid;

    if (!assigneeUid) {
      console.log(`Task ${context.params.taskId} created without an assignee.`);
      return null;
    }

    try {
      const userRecord = await admin.auth().getUser(assigneeUid);
      const email = userRecord.email;

      if (email) {
        const mailOptions = {
          from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Nueva Tarea Asignada: ${task.title}`,
          html: `
            <p>Hola,</p>
            <p>Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.</p>
            <p><strong>Descripción:</strong> ${task.description || 'N/A'}</p>
            <p><strong>Fecha de Vencimiento:</strong> ${task.dueDate || 'N/A'}</p>
            <p>Puedes ver los detalles en la aplicación.</p>
            <p>Saludos,<br>El equipo de Gestión PRO</p>
          `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Assignment email sent to ${email} for task ${context.params.taskId}.`);
      }
      return null;
    } catch (error) {
      console.error(`Failed to send assignment email for task ${context.params.taskId}:`, error);
      return null;
    }
  });

exports.getTaskSummaryWithAI = functions.https.onCall(async (data, context) => {
    // ... function logic
});

// CORRECTED SYNTAX
exports.enviarRecordatoriosDeVencimiento = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });

// =================================================================================
// --- AI AGENT ARCHITECTURE ---
// =================================================================================

/**
 * Generates a consistent SHA-256 hash for a given user prompt and task list.
 * This is used as a key for caching AI-generated plans to reduce costs and improve latency.
 * @param {string} userPrompt The user's text prompt.
 * @param {Array<object>} tasks The user's list of tasks.
 * @returns {string} A SHA-256 hash string.
 */
const CRITICAL_TASK_FIELDS_FOR_HASH = [
    'docId',
    'title',
    'status',
    'plannedDate',
    'dueDate',
    'priority',
    'assigneeEmail',
    'blocked',
    'dependsOn',
    'blocks',
    'subtasks',
];

const normalizeObjectKeys = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeObjectKeys(item));
    }
    if (value && typeof value === 'object') {
        const sortedKeys = Object.keys(value).sort();
        return sortedKeys.reduce((acc, key) => {
            acc[key] = normalizeObjectKeys(value[key]);
            return acc;
        }, {});
    }
    return value;
};

const normalizeTaskForHash = (task = {}) => {
    const normalizedTask = {};

    CRITICAL_TASK_FIELDS_FOR_HASH.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(task, field)) {
            return;
        }

        let value = task[field];
        if (value === undefined) {
            return;
        }

        if (field === 'dependsOn' || field === 'blocks') {
            if (!Array.isArray(value)) {
                return;
            }
            value = value
                .filter((entry) => entry !== undefined && entry !== null)
                .map((entry) => String(entry))
                .sort((a, b) => a.localeCompare(b));
        } else if (field === 'subtasks') {
            if (!Array.isArray(value)) {
                return;
            }
            value = value.map((subtask) => normalizeObjectKeys(subtask || {}));
        } else if (value && typeof value === 'object') {
            value = normalizeObjectKeys(value);
        }

        normalizedTask[field] = value;
    });

    return normalizeObjectKeys(normalizedTask);
};

const compareNormalizedEntries = (a, b) => {
    const aString = JSON.stringify(a);
    const bString = JSON.stringify(b);
    if (aString < bString) {
        return -1;
    }
    if (aString > bString) {
        return 1;
    }
    return 0;
};

const generateRequestHash = (userPrompt, tasks) => {
    const promptString = userPrompt == null ? '' : String(userPrompt);
    const normalizedTasks = Array.isArray(tasks)
        ? tasks.map((task) => normalizeTaskForHash(task))
        : [];

    const sortedTasks = normalizedTasks.sort(compareNormalizedEntries);
    const payload = {
        userPrompt: promptString,
        tasks: sortedTasks,
    };

    const serializedPayload = JSON.stringify(payload);
    return crypto.createHash('sha256').update(serializedPayload).digest('hex');
};

/**
 * Generates a robust temporary ID for newly created tasks within an AI job.
 * Falls back to random bytes if `crypto.randomUUID` is unavailable.
 *
 * @param {string|undefined} jobId The job ID associated with the current plan.
 * @returns {string} A unique temporary identifier prefixed with `temp_`.
 */
const generateTemporaryTaskId = (jobId) => {
    const jobSegment = jobId ? `${jobId}_` : '';
    if (typeof crypto.randomUUID === 'function') {
        return `temp_${jobSegment}${crypto.randomUUID()}`;
    }
    return `temp_${jobSegment}${crypto.randomBytes(16).toString('hex')}`;
};

const generateSubtaskId = () => {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
};

exports.startAIAgentJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    let { userPrompt, tasks, conversationId } = data; // Now accepts an optional conversationId
    if (!userPrompt || !tasks) {
        throw new functions.https.HttpsError("invalid-argument", "The 'userPrompt' and 'tasks' are required.");
    }

    const db = admin.firestore();
    const userTimeZone = DEFAULT_AI_TIME_ZONE;
    const explicitDatesFromUser = extractExplicitDatesFromPrompt(userPrompt, { timeZone: userTimeZone });
    const conversationsRef = db.collection('ai_conversations');
    let conversationHistory = [];

    if (conversationId) {
        const conversationSnap = await conversationsRef.doc(conversationId).get();
        if (conversationSnap.exists) {
            conversationHistory = conversationSnap.data().history || [];
        } else {
            console.warn(`Conversation ID "${conversationId}" provided but not found. Starting new conversation.`);
            conversationId = null; // Reset to create a new one
        }
    }

    const CONVERSATION_SUMMARY_THRESHOLD = 8;
    if (conversationHistory.length > CONVERSATION_SUMMARY_THRESHOLD) {
        try {
            console.log(`Conversation ${conversationId} exceeds threshold of ${CONVERSATION_SUMMARY_THRESHOLD}, attempting summarization.`);
            const {VertexAI} = require("@google-cloud/vertexai");
            const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
            const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            const turnsToSummarizeCount = conversationHistory.length - 4; // Keep the last 2 exchanges
            const historyToSummarize = conversationHistory.slice(0, turnsToSummarizeCount);
            const recentHistory = conversationHistory.slice(turnsToSummarizeCount);

            const summaryPrompt = `Summarize the following conversation between a user and a project management assistant. The user's goal is to manage their tasks. The summary should be concise, in Spanish, and capture the key decisions, tasks mentioned, and the overall context. This summary will provide context to the assistant for future turns. Do not add any preamble like "Here is the summary".

Conversation to summarize:
${JSON.stringify(historyToSummarize, null, 2)}`;

            const result = await generativeModel.generateContent({ contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }] });
            const summaryText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (summaryText) {
                conversationHistory = [
                    { role: 'model', parts: [{ text: `Contexto previo (resumen): ${summaryText}` }] },
                    ...recentHistory
                ];
                console.log(`Successfully summarized conversation ${conversationId}. New length: ${conversationHistory.length}`);
            } else {
                 console.warn(`Summarization of conversation ${conversationId} failed: model did not return valid text.`);
            }
        } catch(e) {
            console.error(`Error during conversation summarization for ${conversationId}:`, e);
            // If summarization fails, proceed with the full history as a fallback.
        }
    }

    if (!conversationId) {
        const newConversationRef = conversationsRef.doc();
        await newConversationRef.set({
            creatorUid: context.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            history: []
        });
        conversationId = newConversationRef.id;
    }

    conversationHistory.push({ role: 'user', parts: [{ text: `User Request: "${userPrompt}"` }] });

    // Fetch all users to provide as context to the AI for assignments.
    const usersSnapshot = await db.collection('usuarios').get();
    const allUsers = usersSnapshot.docs.map(doc => {
        const data = doc.data() || {}; // Handle cases where data might be missing
        const nombre = data.nombre || ''; // Default to empty string if missing
        const email = data.email || '';   // Default to empty string if missing
        return { id: doc.id, nombre, email };
    });
    const requestHash = generateRequestHash(userPrompt, tasks);
    const cacheRef = db.collection('ai_plan_cache').doc(requestHash);
    const cachedPlan = await cacheRef.get();

    const jobRef = db.collection('ai_agent_jobs').doc();

    // Cache Hit: If a plan exists, create a pre-completed job.
    if (cachedPlan.exists) {
        const { executionPlan, summary, sanitySuggestions = [] } = cachedPlan.data();
        const jobData = {
            status: 'COMPLETED', // Instantly completed
            userPrompt,
            tasks,
            creatorUid: context.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            executionPlan,
            summary,
            thoughtProcess: `### Plan de la IA (desde caché)\n\n${summary}`,
            isFromCache: true,
            conversationId: conversationId, // Pass conversation ID along
            conversationHistory,
            currentDate: getCurrentDateForUserTZ({ timeZone: userTimeZone }),
            timeZone: userTimeZone,
            sanitySuggestions,
            explicitDatesFromUser,
        };
        await jobRef.set(jobData);
        return { jobId: jobRef.id, conversationId: conversationId, isFromCache: true };
    }

    // Cache Miss: Create a pending job to be processed by the AI.
    const jobData = {
        status: 'PENDING',
        userPrompt,
        tasks,
        allUsers,
        creatorUid: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        currentDate: getCurrentDateForUserTZ({ timeZone: userTimeZone }),
        timeZone: userTimeZone,
        conversationHistory, // Use existing or new history
        thinkingSteps: [],
        executionPlan: [],
        summary: '',
        requestHash, // Store hash for later caching
        conversationId: conversationId, // Pass conversation ID along
        foundTasksContext: [], // Initialize the new memory field
        sanitySuggestions: [],
        explicitDatesFromUser,
    };

    await jobRef.set(jobData);

    return { jobId: jobRef.id, conversationId: conversationId, isFromCache: false };
});


exports.aiAgentJobRunner = functions.runWith({timeoutSeconds: 120}).firestore.document('ai_agent_jobs/{jobId}')
    .onCreate(async (snap, context) => {
        const jobRef = snap.ref;
        const jobData = snap.data();
        const currentJobId = context?.params?.jobId;
        let { userPrompt, tasks, allUsers, currentDate, conversationHistory, executionPlan, thinkingSteps, summary, conversationId, foundTasksContext, timeZone, sanitySuggestions = [], explicitDatesFromUser = [] } = jobData;

        const effectiveTimeZone = timeZone || DEFAULT_AI_TIME_ZONE;
        currentDate = currentDate || getCurrentDateForUserTZ({ timeZone: effectiveTimeZone });

        conversationHistory = Array.isArray(conversationHistory) ? conversationHistory : [];

        const explicitDateQueue = Array.isArray(explicitDatesFromUser) ? [...explicitDatesFromUser] : [];
        const explicitDateCorrections = [];
        let hasExplicitDateCorrectionInSummary = false;

        const consumeNextExplicitDate = () => {
            if (!explicitDateQueue.length) {
                return null;
            }
            const next = explicitDateQueue.shift();
            if (!next || !next.isoDate) {
                return null;
            }
            return next;
        };

        try {
            await jobRef.update({ status: 'RUNNING' });

                let noProgressCounter = 0;
                let lastToolCall = null;

            // AI Model Configuration: Using gemini-2.5-flash-lite for cost-efficiency.
            const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
            const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            const allowedEfforts = ['low', 'medium', 'high'];
            const normalizeEffortValue = (value) => {
                if (typeof value !== 'string') {
                    return null;
                }
                const normalized = value.trim().toLowerCase();
                return allowedEfforts.includes(normalized) ? normalized : null;
            };

            const effortHumanLabels = {
                low: 'Bajo',
                medium: 'Medio',
                high: 'Alto',
            };

            tasks = Array.isArray(tasks)
                ? tasks.map(task => {
                    const normalized = normalizeEffortValue(task?.effort);
                    return { ...task, effort: normalized || 'medium' };
                })
                : [];

            const toolSchemas = {
                create_task: {
                    title: { type: 'string', required: true },
                    description: { type: 'string' },
                    plannedDate: { type: 'string', required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
                    dueDate: { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/ },
                    assigneeEmail: { type: 'string', pattern: /.+@.+\..+/ },
                    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                    effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                    subtasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string', required: true } } } },
                    isProjectTask: { type: 'boolean' }
                },
                create_dependency: {
                    dependent_task_id: { type: 'string', required: true },
                    prerequisite_task_id: { type: 'string', required: true }
                },
                delete_task: {
                    task_id: { type: 'string', required: true }
                },
                complete_task: {
                    task_id: { type: 'string', required: true }
                },
                update_task: {
                    task_id: { type: 'string', required: true },
                    updates: { type: 'object', required: true }
                },
                bulk_update_tasks: {
                    updates: { type: 'array', required: true }
                },
                find_tasks: {
                    filter: { type: 'object', required: true }
                },
                answer_question: {
                    answer: { type: 'string', required: true }
                },
                review_and_summarize_plan: {},
                critique_plan: {},
                finish: {},
                no_op: {}
            };

            const validateToolParameters = (toolId, params) => {
                const schema = toolSchemas[toolId];
                if (!schema) return `Unknown tool ID: ${toolId}`;

                for (const key in schema) {
                    const rule = schema[key];
                    if (rule.required && !params.hasOwnProperty(key)) {
                        return `Missing required parameter for ${toolId}: ${key}`;
                    }
                    if (params.hasOwnProperty(key)) {
                        const value = params[key];
                        if (rule.type && typeof value !== rule.type) {
                            return `Invalid type for parameter ${key} in ${toolId}. Expected ${rule.type}, got ${typeof value}`;
                        }
                        if (rule.pattern && !rule.pattern.test(value)) {
                            return `Invalid format for parameter ${key} in ${toolId}.`;
                        }
                        if (rule.enum && !rule.enum.includes(value)) {
                            return `Invalid value for parameter ${key} in ${toolId}. Must be one of: ${rule.enum.join(', ')}`;
                        }
                    }
                }
                return null;
            };
            const toolDefinitions = [
                // Tool definitions remain the same
                 {
                    "id": "create_task",
                    "description": "Creates a new task. You MUST determine the best `plannedDate` by analyzing the user's current schedule. Only set a `dueDate` if a specific deadline is mentioned. Can be assigned to a user by providing their email.",
                    "parameters": {
                        "title": "string",
                        "description": "string (optional)",
                        "plannedDate": "string (YYYY-MM-DD)",
                        "dueDate": "string (YYYY-MM-DD, optional)",
                        "assigneeEmail": "string (optional)",
                        "priority": "string (optional: low|medium|high)",
                        "effort": "string (optional: low|medium|high)",
                        "subtasks": "array (optional, each item: { title: string, completed?: boolean })",
                        "isProjectTask": "boolean (optional, default: false)"
                    }
                },
                {
                    id: 'create_dependency',
                    description: 'Creates a dependency between two tasks. The first task will be blocked until the second one is complete.',
                    parameters: {
                        dependent_task_id: 'string',
                        prerequisite_task_id: 'string'
                    }
                },
                {
                    id: 'delete_task',
                    description: 'Deletes an existing task using its ID.',
                    parameters: {
                        task_id: 'string'
                    }
                },
                {
                    id: 'complete_task',
                    description: "Marks an existing task as 'done' using its ID.",
                    parameters: {
                        task_id: 'string'
                    }
                },
                {
                    id: 'update_task',
                    description: 'Updates properties of an existing task. Use this to change the plannedDate, title, description, assignee, or other attributes. The `updates` object can include `isProjectTask`.',
                    parameters: {
                        task_id: 'string',
                        updates: 'object' // Can include assigneeEmail, isProjectTask
                    }
                },
                {
                    id: 'bulk_update_tasks',
                    description: 'Updates multiple tasks in a single operation. Provide a list of task IDs and the corresponding updates for each.',
                    parameters: {
                        updates: 'array'
                    }
                },
                 {
                    id: 'review_and_summarize_plan',
                    description: 'Call this as your final step before using "finish". It reviews the execution plan you have constructed and generates an accurate, bulleted-point summary for the user. It takes no parameters.',
                    parameters: {}
                },
                {
                    id: 'critique_plan',
                    description: 'Analyzes the current execution plan for logical errors, overloaded days, or other issues. Returns a list of suggestions for improvement. This MUST be called before "review_and_summarize_plan".',
                    parameters: {}
                },
                {
                    id: 'find_tasks',
                    description: 'Finds tasks based on a property filter. Supports searching by `title` for partial matches, and suffixes for advanced queries: `_lte` (less/equal), `_gte` (greater/equal), `_ne` (not equal). Example: `{"title": "PWA", "status_ne": "done"}` finds all unfinished tasks containing "PWA". Returns a JSON object like `{\\"tasks\\": [...]}`.',
                    parameters: {
                        filter: 'object'
                    }
                },
                 {
                    id: 'answer_question',
                    description: 'Use this tool to provide a direct, final answer to a user\'s question. This should be used when the user is asking for information, not for creating or modifying tasks. The provided answer will be shown directly to the user.',
                    parameters: {
                        answer: 'string'
                    }
                },
                {
                    id: 'finish',
                    description: 'Call this when you have a complete plan and all tasks and dependencies have been created.',
                    parameters: {}
                },
                {
                    id: 'no_op',
                    description: 'Call this when the user\'s request does not require any action or changes to tasks. For example, if the user says "thanks".',
                    parameters: {}
                }
            ];

            const buildSystemPrompt = () => `
You are 'Gestión PRO', an elite, autonomous project management assistant. Your goal is to help users manage tasks efficiently by interpreting natural language requests and creating an actionable plan using the provided tools. Your reasoning ('thought') **MUST** be in Spanish.

# Workflow: Analyze -> Clarify -> Plan -> Act

1.  **Analyze & Understand:** Scrutinize the user's request to identify all explicit and implicit intents.
2.  **Clarify (If Necessary):**
    *   If a \`find_tasks\` query is ambiguous and returns multiple results, you **MUST** ask for clarification using \`answer_question\`. List the options by title. Do not guess.
    *   If \`find_tasks\` returns no results, you **MUST** inform the user with \`answer_question\`.
3.  **Plan & Act:** Construct a step-by-step plan in your 'thought' process and execute it by calling the necessary tools.

# Core Rules

## 1. Task & Date Management
*   **Always Find First:** Before modifying any task, you **MUST** use \`find_tasks\` to retrieve its current data and ID.
*   **Date Parsing:**
    *   Today/Hoy is always: \`${currentDate}\`.
    *   Calculate relative dates (e.g., "mañana" is +1 day, "el lunes" is the next upcoming Monday) to a final \`YYYY-MM-DD\` date.
*   **Default \`plannedDate\`:** Every new task **MUST** have a \`plannedDate\`. If unspecified, assign one intelligently.
*   **Task Classification:** You **MUST** classify every new task. A task is a **Project Task** (\`isProjectTask: true\`) if it involves dependencies, spans multiple days, has a dueDate, or the user's language implies a larger project (e.g., "phase," "milestone," "epic"). All other tasks are simple tasks.

## 2. Dependencies & Queries
*   **Dependencies:** To make Task B depend on Task A, call \`create_dependency\` with \`dependent_task_id: B_id\` and \`prerequisite_task_id: A_id\`. The system auto-unblocks tasks upon prerequisite completion.
*   **Answering Questions:** For informational questions (who, what, when, etc.), use your tools to gather data, then deliver a concise, final answer with the \`answer_question\` tool, starting your response with "Respuesta:".
*   **Hide IDs:** Never show internal IDs to the user. Use human-readable fields like titles and dates.

## 3. Plan Finalization & Task Attributes
*   **Reflect & Critique:** Before summarizing, you **MUST** call \`critique_plan\` to analyze your own plan for errors. If issues are found, you must correct them using your tools (e.g., \`update_task\`).
*   **Mandatory Summary:** After a successful critique, you **MUST** call \`review_and_summarize_plan\` as the final step before \`finish\`. The summary must be a clear, bulleted list of staged actions.
*   **No Action:** If the user's request does not require any changes (e.g., "gracias"), call the \`no_op\` tool to finish gracefully.
*   **Priority & Effort:** Use priority \`high\` only for explicitly urgent tasks. Default effort to \`medium\` unless specified otherwise. Keep daily planned effort below 8 points (low=1, medium=3, high=5).
*   **Subtasks:** Declare subtasks within the \`create_task\` call using the \`subtasks\` array. They always start as 'pending'.

# Context Data
*   **Today's Date:** ${currentDate}
*   **Conversation Summary:** Your conversation history may include a summary of previous turns. Use this summary as context for the current request.
*   **Existing Tasks:** ${JSON.stringify(tasks.map(t => ({id: t.docId, title: t.title, status: t.status, plannedDate: t.plannedDate, effort: t.effort || 'medium', dependsOn: t.dependsOn || [], blocks: t.blocks || []})))}
*   **Found Tasks (from \`find_tasks\`):** ${JSON.stringify(foundTasksContext)}
*   **Available Users for assignment:** ${JSON.stringify(allUsers.map(u => u.email))}

# Response Format
Your entire response **MUST** be a single, valid JSON object in a markdown block.
\`\`\`json
{
    "thought": "My detailed reasoning in Spanish about my plan.",
    "tool_code": { "tool_id": "tool_name", "parameters": {"param": "value"} }
}
\`\`\`
            `;

            let i = 0;
            const maxIterations = 15;
            while (i < maxIterations) {
                i++;
                let agentResponse;
                let lastError = null;

                // Inner loop for retrying the model call on JSON parsing errors
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const systemPrompt = buildSystemPrompt();
                        let prompt = `${systemPrompt}\n\n**Conversation History:**\n${JSON.stringify(conversationHistory, null, 2)}`;
                        if (attempt > 0) {
                            prompt += `\n\n**Previous Attempt Failed:** Your last response was not valid JSON. Please ensure your entire response is a single, valid JSON object as requested in the system prompt.`;
                        }

                        const result = await generativeModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
                        const responseText = result.response.candidates[0].content.parts[0].text;
                        const jsonMatch = responseText.match(/{[\s\S]*}/);

                        if (!jsonMatch) {
                            throw new Error("Response did not contain a JSON object.");
                        }

                        agentResponse = JSON.parse(jsonMatch[0]);
                        lastError = null; // Clear error on success
                        break; // Exit retry loop on success
                    } catch (e) {
                        lastError = e;
                        console.warn(`Attempt ${attempt + 1} failed: ${e.message}`);
                        if (attempt === 2) {
                             throw new Error(`Agent did not return valid JSON after 3 attempts. Last error: ${lastError.message}`);
                        }
                    }
                }

                const { thought: rawThought, tool_code: rawToolCode } = agentResponse;
                const currentToolCallString = JSON.stringify(rawToolCode);
                if (lastToolCall && currentToolCallString === lastToolCall) {
                    noProgressCounter++;
                } else {
                    noProgressCounter = 0;
                }

                if (noProgressCounter >= 3) {
                    console.warn(`Agent may be stuck in a loop. Terminating job ${currentJobId}.`);
                    summary = "El asistente de IA se detuvo porque no estaba progresando. Por favor, reformula tu solicitud.";
                    break;
                }
                lastToolCall = currentToolCallString;

                // Default to 'finish' to ensure the loop terminates gracefully on malformed responses.
                const tool_code = rawToolCode || { tool_id: 'finish', parameters: {} };

                // Provide a more contextual default thought if it's missing.
                const thought = rawThought || (tool_code.tool_id === 'finish'
                    ? 'Plan execution has been completed.'
                    : `Preparing to execute tool: ${tool_code.tool_id}.`);

                thinkingSteps.push({ thought, tool_code: tool_code.tool_id });
                await jobRef.update({
                    thinkingSteps: admin.firestore.FieldValue.arrayUnion({ thought, tool_code: tool_code.tool_id, timestamp: new Date() }),
                    foundTasksContext,
                });


                if (tool_code.tool_id === 'finish' || tool_code.tool_id === 'answer_question' || tool_code.tool_id === 'no_op') {
                    if (tool_code.tool_id === 'answer_question') {
                        summary = tool_code.parameters.answer; // Capture the answer
                    }
                    if (tool_code.tool_id === 'no_op') {
                        summary = "No se requiere ninguna acción.";
                    }
                    break;
                }

                let toolResult = '';
                const validationError = validateToolParameters(tool_code.tool_id, tool_code.parameters);
                if (validationError) {
                    toolResult = `Error: ${validationError}`;
                } else {
                    try {
                        // Tool execution logic remains the same
                        switch (tool_code.tool_id) {
                            case 'critique_plan': {
                                const sanitySuggestions = await exports.analyzePlanSanity({ plan: executionPlan, tasks });
                                if (sanitySuggestions.suggestions.length > 0) {
                                    toolResult = `Critique found issues: ${sanitySuggestions.suggestions.join('. ')}`;
                                } else {
                                    toolResult = 'OK. No issues found in the plan.';
                                }
                                break;
                            }
                            case 'review_and_summarize_plan':
                                if (executionPlan.length === 0) {
                                summary = "No se realizaron cambios.";
                            } else {
                                const summaryPoints = executionPlan.map(action => {
                                    if (action.action === 'CREATE') {
                                        return `* Crear la tarea: "${action.task.title}"`;
                                    }
                                    if (action.action === 'UPDATE') {
                                        return `* Actualizar la tarea: "${action.originalTitle}"`;
                                    }
                                    if (action.action === 'DELETE') {
                                        return `* Eliminar la tarea: "${action.originalTitle}"`;
                                    }
                                    return '* Realizar una acción desconocida.';
                                });
                                if (explicitDateCorrections.length > 0) {
                                    const correctionPoints = explicitDateCorrections.map(correction => {
                                        const taskTitle = correction.taskTitle || 'tarea';
                                        const previous = correction.from ? ` (antes ${correction.from})` : ' (no tenía fecha previa)';
                                        return `* Se corrigió la fecha de "${taskTitle}" a ${correction.to} para respetar "${correction.originalText}" indicado por el usuario${previous}.`;
                                    });
                                    if (correctionPoints.length > 0) {
                                        summaryPoints.push(...correctionPoints);
                                        hasExplicitDateCorrectionInSummary = true;
                                    }
                                }
                                summary = summaryPoints.join('\n');
                            }
                            toolResult = `OK. Plan summarized accurately from execution plan.`;
                            break;
                        case 'create_task': {
                            if (userPrompt.toLowerCase().includes('planning')) {
                                tool_code.parameters.isProjectTask = true;
                            }
                            const effortCost = { high: 5, medium: 3, low: 1 };
                            const dailyEffortLimit = 8;
                            const plannedDate = tool_code.parameters.plannedDate;
                            const newEffort = effortCost[tool_code.parameters.effort] || 3;

                            const effortOnDate = tasks.reduce((total, task) => {
                                if (task.plannedDate === plannedDate) {
                                    return total + (effortCost[task.effort] || 3);
                                }
                                return total;
                            }, 0);

                            if (effortOnDate + newEffort > dailyEffortLimit) {
                                toolResult = `Error: Cannot add task on ${plannedDate} as it would exceed the daily effort limit of ${dailyEffortLimit}. Current effort is ${effortOnDate}. Please choose another date.`;
                                break;
                            }
                            const tempId = generateTemporaryTaskId(currentJobId);
                            const taskPayload = { ...tool_code.parameters };
                            const allowedPriorities = ['low', 'medium', 'high'];

                            if (Object.prototype.hasOwnProperty.call(taskPayload, 'priority')) {
                                const rawPriority = typeof taskPayload.priority === 'string'
                                    ? taskPayload.priority.trim().toLowerCase()
                                    : '';
                                if (allowedPriorities.includes(rawPriority)) {
                                    taskPayload.priority = rawPriority;
                                } else {
                                    delete taskPayload.priority;
                                }
                            }

                            const normalizedEffort = normalizeEffortValue(taskPayload.effort);
                            if (normalizedEffort) {
                                taskPayload.effort = normalizedEffort;
                            } else {
                                taskPayload.effort = 'medium';
                            }

                            if (Object.prototype.hasOwnProperty.call(taskPayload, 'subtasks')) {
                                if (Array.isArray(taskPayload.subtasks)) {
                                    const sanitizedSubtasks = taskPayload.subtasks.reduce((acc, subtask) => {
                                        if (!subtask || typeof subtask.title !== 'string') {
                                            return acc;
                                        }
                                        const title = subtask.title.trim();
                                        if (!title) {
                                            return acc;
                                        }
                                        acc.push({
                                            id: generateSubtaskId(),
                                            title,
                                            completed: false,
                                        });
                                        return acc;
                                    }, []);
                                    if (sanitizedSubtasks.length > 0) {
                                        taskPayload.subtasks = sanitizedSubtasks;
                                    } else {
                                        delete taskPayload.subtasks;
                                    }
                                } else {
                                    delete taskPayload.subtasks;
                                }
                            }

                            const createTaskTitle = taskPayload.title || 'Tarea sin título';
                            const modelPlannedDate = taskPayload.plannedDate;

                            const normalizationResult = normalizePlannedDate(modelPlannedDate, effectiveTimeZone);
                            let finalPlannedDate = modelPlannedDate;
                            if (modelPlannedDate && normalizationResult.normalizedDate) {
                                finalPlannedDate = normalizationResult.normalizedDate;
                            }

                            let weekendAdjustment = null;
                            let planEntryNotes = [];
                            let explicitOverrideInfo = null;

                            if (normalizationResult.wasAdjusted && normalizationResult.normalizedDate) {
                                weekendAdjustment = {
                                    from: normalizationResult.originalDate,
                                    to: normalizationResult.normalizedDate,
                                    fromWeekday: normalizationResult.originalWeekday,
                                    toWeekday: normalizationResult.normalizedWeekday,
                                    taskTitle: createTaskTitle,
                                };
                            }

                            const explicitCandidate = consumeNextExplicitDate();
                            if (explicitCandidate) {
                                const previousFinalDate = weekendAdjustment ? weekendAdjustment.to : finalPlannedDate;
                                if (!modelPlannedDate || explicitCandidate.isoDate !== previousFinalDate) {
                                    const requestedDate = explicitCandidate.isoDate;
                                    const rolledToFuture = Boolean(explicitCandidate.rolledToFuture);
                                    let overrideFinalDate = requestedDate;
                                    let overrideWeekendAdjustment = null;

                                    if (rolledToFuture) {
                                        const overrideNormalization = normalizePlannedDate(requestedDate, effectiveTimeZone);
                                        if (overrideNormalization.wasAdjusted && overrideNormalization.normalizedDate) {
                                            overrideFinalDate = overrideNormalization.normalizedDate;
                                            overrideWeekendAdjustment = {
                                                from: overrideNormalization.originalDate,
                                                to: overrideNormalization.normalizedDate,
                                                fromWeekday: overrideNormalization.originalWeekday,
                                                toWeekday: overrideNormalization.normalizedWeekday,
                                                taskTitle: createTaskTitle,
                                            };
                                        }
                                    }

                                    finalPlannedDate = overrideFinalDate;
                                    weekendAdjustment = overrideWeekendAdjustment;

                                    explicitOverrideInfo = {
                                        from: previousFinalDate || null,
                                        to: overrideFinalDate,
                                        originalText: explicitCandidate.originalText,
                                        taskTitle: createTaskTitle,
                                        requestedDate,
                                    };

                                    if (rolledToFuture) {
                                        explicitOverrideInfo.rolledToFuture = true;
                                    }

                                    const noteParts = [
                                        `Fecha ajustada para respetar la indicación del usuario "${explicitCandidate.originalText}".`,
                                    ];
                                    if (overrideWeekendAdjustment && requestedDate !== overrideFinalDate) {
                                        noteParts.push(`Se movió de ${requestedDate} a ${overrideFinalDate} para evitar fines de semana.`);
                                    } else {
                                        noteParts.push(`Se estableció ${overrideFinalDate}.`);
                                    }
                                    planEntryNotes.push(noteParts.join(' '));

                                    sanitySuggestions.push(`Se corrigió la fecha de "${createTaskTitle}" a ${overrideFinalDate} porque el usuario indicó "${explicitCandidate.originalText}".`);
                                    explicitDateCorrections.push({
                                        taskTitle: createTaskTitle,
                                        from: explicitOverrideInfo.from,
                                        to: overrideFinalDate,
                                        originalText: explicitCandidate.originalText,
                                        action: 'CREATE',
                                    });
                                }
                            }

                            if (weekendAdjustment) {
                                const weekendOriginal = explicitOverrideInfo?.requestedDate || weekendAdjustment.from;
                                const weekendNote = explicitOverrideInfo && explicitOverrideInfo.originalText
                                    ? `La fecha indicada por el usuario "${explicitOverrideInfo.originalText}" caía en ${weekendAdjustment.fromWeekday} (${weekendOriginal}) y se reprogramó automáticamente al ${weekendAdjustment.toWeekday} (${weekendAdjustment.to}) para evitar fines de semana.`
                                    : `Fecha planificada movida automáticamente de ${weekendAdjustment.fromWeekday} (${weekendAdjustment.from}) a ${weekendAdjustment.toWeekday} (${weekendAdjustment.to}) para evitar fines de semana.`;
                                planEntryNotes.push(weekendNote);
                                const sanityMessage = explicitOverrideInfo && explicitOverrideInfo.originalText
                                    ? `"${createTaskTitle}" se reprogramó al ${weekendAdjustment.toWeekday} ${weekendAdjustment.to} porque la fecha indicada por el usuario (${weekendOriginal}) caía en fin de semana.`
                                    : `"${createTaskTitle}" se reprogramó al ${weekendAdjustment.toWeekday} ${weekendAdjustment.to} porque la fecha sugerida caía en fin de semana.`;
                                sanitySuggestions.push(sanityMessage);
                            }

                            if (finalPlannedDate) {
                                taskPayload.plannedDate = finalPlannedDate;
                            }

                            const createPlanEntry = { action: "CREATE", docId: tempId, task: taskPayload };

                            if (weekendAdjustment || explicitOverrideInfo) {
                                createPlanEntry.adjustments = {};
                                if (weekendAdjustment) {
                                    createPlanEntry.adjustments.plannedDate = weekendAdjustment;
                                }
                                if (explicitOverrideInfo) {
                                    createPlanEntry.adjustments.explicitDateOverride = explicitOverrideInfo;
                                }
                            }

                            if (explicitOverrideInfo) {
                                const metadataPayload = {
                                    isoDate: explicitOverrideInfo.to,
                                    originalText: explicitOverrideInfo.originalText,
                                };
                                if (explicitOverrideInfo.requestedDate && explicitOverrideInfo.requestedDate !== explicitOverrideInfo.to) {
                                    metadataPayload.requestedDate = explicitOverrideInfo.requestedDate;
                                }
                                if (explicitOverrideInfo.rolledToFuture) {
                                    metadataPayload.rolledToFuture = true;
                                }
                                createPlanEntry.metadata = {
                                    ...(createPlanEntry.metadata || {}),
                                    explicitDateOverride: metadataPayload,
                                };
                            }

                            if (planEntryNotes.length > 0) {
                                createPlanEntry.notes = planEntryNotes;
                            }

                            executionPlan.push(createPlanEntry);
                            const taskContextEntry = {
                                docId: tempId,
                                title: createTaskTitle,
                                status: 'todo',
                                plannedDate: taskPayload.plannedDate,
                                effort: taskPayload.effort
                            };

                            if (taskPayload.priority) {
                                taskContextEntry.priority = taskPayload.priority;
                            }

                            if (Array.isArray(taskPayload.subtasks)) {
                                taskContextEntry.subtasks = taskPayload.subtasks.map(subtask => ({ ...subtask }));
                            }

                            tasks.push(taskContextEntry);
                            toolResult = `OK. Task created with temporary ID: ${tempId}.`;
                            break;
                        }
                        case 'create_dependency':
                            const { dependent_task_id, prerequisite_task_id } = tool_code.parameters;
                            const dependentTaskContext = tasks.find(t => t.docId === dependent_task_id);
                            const prerequisiteTaskContext = tasks.find(t => t.docId === prerequisite_task_id);

                            executionPlan.push({
                                action: "UPDATE",
                                docId: dependent_task_id,
                                originalTitle: dependentTaskContext?.title || 'Tarea sin título',
                                updates: { dependsOn: [prerequisite_task_id], blocked: true }
                            });
                            executionPlan.push({
                                action: "UPDATE",
                                docId: prerequisite_task_id,
                                originalTitle: prerequisiteTaskContext?.title || 'Tarea sin título',
                                updates: { blocks: [dependent_task_id] }
                            });

                            if (dependentTaskContext) {
                                const dependsOnSet = new Set([...(dependentTaskContext.dependsOn || []), prerequisite_task_id]);
                                dependentTaskContext.dependsOn = Array.from(dependsOnSet);
                                dependentTaskContext.blocked = true;
                            }

                            if (prerequisiteTaskContext) {
                                const blocksSet = new Set([...(prerequisiteTaskContext.blocks || []), dependent_task_id]);
                                prerequisiteTaskContext.blocks = Array.from(blocksSet);
                            }

                            toolResult = `OK. Dependency created: ${dependent_task_id} now depends on ${prerequisite_task_id}.`;
                            break;
                        case 'delete_task':
                            const { task_id } = tool_code.parameters;
                            const taskIndexToDelete = tasks.findIndex(t => t.docId === task_id);
                            if (taskIndexToDelete > -1) {
                                const taskToDelete = tasks[taskIndexToDelete];
                                executionPlan.push({
                                    action: "DELETE",
                                    docId: task_id,
                                    originalTitle: taskToDelete.title
                                });
                                tasks.splice(taskIndexToDelete, 1);
                                toolResult = `OK. Task "${taskToDelete.title}" marked for deletion and removed from context.`;
                            } else {
                                toolResult = `Error: Task with ID "${task_id}" not found.`;
                            }
                            break;
                        case 'update_task': {
                            const { task_id: update_task_id, updates } = tool_code.parameters;
                            const taskToUpdate = tasks.find(t => t.docId === update_task_id);

                            if (updates.plannedDate && taskToUpdate) {
                                const effortCost = { high: 5, medium: 3, low: 1 };
                                const dailyEffortLimit = 8;
                                const plannedDate = updates.plannedDate;
                                const taskEffort = effortCost[updates.effort || taskToUpdate.effort] || 3;

                                const effortOnDate = tasks.reduce((total, task) => {
                                    if (task.plannedDate === plannedDate && task.docId !== update_task_id) {
                                        return total + (effortCost[task.effort] || 3);
                                    }
                                    return total;
                                }, 0);

                                if (effortOnDate + taskEffort > dailyEffortLimit) {
                                    toolResult = `Error: Cannot move task to ${plannedDate} as it would exceed the daily effort limit of ${dailyEffortLimit}. Current effort on that day is ${effortOnDate}. Please choose another date.`;
                                    break;
                                }
                            }
                            if (taskToUpdate) {
                                const updateTaskTitle = taskToUpdate.title || 'Tarea sin título';
                                const updatePayload = { ...updates };
                                const planEntryNotes = [];
                                let weekendAdjustment = null;
                                let explicitOverrideInfo = null;

                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'plannedDate')) {
                                    const modelUpdateDate = updatePayload.plannedDate;
                                    const normalizationResult = normalizePlannedDate(modelUpdateDate, effectiveTimeZone);
                                    let finalUpdateDate = modelUpdateDate;
                                    if (modelUpdateDate && normalizationResult.normalizedDate) {
                                        finalUpdateDate = normalizationResult.normalizedDate;
                                    }

                                    if (normalizationResult.wasAdjusted && normalizationResult.normalizedDate) {
                                        weekendAdjustment = {
                                            from: normalizationResult.originalDate,
                                            to: normalizationResult.normalizedDate,
                                            fromWeekday: normalizationResult.originalWeekday,
                                            toWeekday: normalizationResult.normalizedWeekday,
                                            taskTitle: updateTaskTitle,
                                        };
                                    }

                                    const explicitCandidate = consumeNextExplicitDate();
                                    if (explicitCandidate) {
                                        const previousFinalDate = weekendAdjustment ? weekendAdjustment.to : finalUpdateDate;
                                        if (!modelUpdateDate || explicitCandidate.isoDate !== previousFinalDate) {
                                            const requestedDate = explicitCandidate.isoDate;
                                            const rolledToFuture = Boolean(explicitCandidate.rolledToFuture);
                                            let overrideFinalDate = requestedDate;
                                            let overrideWeekendAdjustment = null;

                                            if (rolledToFuture) {
                                                const overrideNormalization = normalizePlannedDate(requestedDate, effectiveTimeZone);
                                                if (overrideNormalization.wasAdjusted && overrideNormalization.normalizedDate) {
                                                    overrideFinalDate = overrideNormalization.normalizedDate;
                                                    overrideWeekendAdjustment = {
                                                        from: overrideNormalization.originalDate,
                                                        to: overrideNormalization.normalizedDate,
                                                        fromWeekday: overrideNormalization.originalWeekday,
                                                        toWeekday: overrideNormalization.normalizedWeekday,
                                                        taskTitle: updateTaskTitle,
                                                    };
                                                }
                                            }

                                            finalUpdateDate = overrideFinalDate;
                                            weekendAdjustment = overrideWeekendAdjustment;

                                            explicitOverrideInfo = {
                                                from: previousFinalDate || null,
                                                to: overrideFinalDate,
                                                originalText: explicitCandidate.originalText,
                                                taskTitle: updateTaskTitle,
                                                requestedDate,
                                            };

                                            if (rolledToFuture) {
                                                explicitOverrideInfo.rolledToFuture = true;
                                            }

                                            const noteParts = [
                                                `Fecha ajustada para respetar la indicación del usuario "${explicitCandidate.originalText}".`,
                                            ];
                                            if (overrideWeekendAdjustment && requestedDate !== overrideFinalDate) {
                                                noteParts.push(`Se movió de ${requestedDate} a ${overrideFinalDate} para evitar fines de semana.`);
                                            } else {
                                                noteParts.push(`Se estableció ${overrideFinalDate}.`);
                                            }
                                            planEntryNotes.push(noteParts.join(' '));

                                            sanitySuggestions.push(`Se corrigió la fecha de "${updateTaskTitle}" a ${overrideFinalDate} porque el usuario indicó "${explicitCandidate.originalText}".`);
                                            explicitDateCorrections.push({
                                                taskTitle: updateTaskTitle,
                                                from: explicitOverrideInfo.from,
                                                to: overrideFinalDate,
                                                originalText: explicitCandidate.originalText,
                                                action: 'UPDATE',
                                            });
                                        }
                                    }

                                    if (weekendAdjustment) {
                                        const weekendOriginal = explicitOverrideInfo?.requestedDate || weekendAdjustment.from;
                                        const weekendNote = explicitOverrideInfo && explicitOverrideInfo.originalText
                                            ? `La fecha indicada por el usuario "${explicitOverrideInfo.originalText}" caía en ${weekendAdjustment.fromWeekday} (${weekendOriginal}) y se reprogramó automáticamente al ${weekendAdjustment.toWeekday} (${weekendAdjustment.to}) para evitar fines de semana.`
                                            : `Fecha planificada movida automáticamente de ${weekendAdjustment.fromWeekday} (${weekendAdjustment.from}) a ${weekendAdjustment.toWeekday} (${weekendAdjustment.to}) para evitar fines de semana.`;
                                        planEntryNotes.push(weekendNote);
                                        const sanityMessage = explicitOverrideInfo && explicitOverrideInfo.originalText
                                            ? `"${updateTaskTitle}" se reprogramó al ${weekendAdjustment.toWeekday} ${weekendAdjustment.to} porque la fecha indicada por el usuario (${weekendOriginal}) caía en fin de semana.`
                                            : `"${updateTaskTitle}" se reprogramó al ${weekendAdjustment.toWeekday} ${weekendAdjustment.to} porque la fecha sugerida caía en fin de semana.`;
                                        sanitySuggestions.push(sanityMessage);
                                    }

                                    if (finalUpdateDate) {
                                        updatePayload.plannedDate = finalUpdateDate;
                                        taskToUpdate.plannedDate = finalUpdateDate;
                                    }
                                }

                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'effort')) {
                                    const normalized = normalizeEffortValue(updatePayload.effort);
                                    if (normalized) {
                                        updatePayload.effort = normalized;
                                        taskToUpdate.effort = normalized;
                                    } else {
                                        delete updatePayload.effort;
                                    }
                                }

                                const updatePlanEntry = {
                                    action: "UPDATE",
                                    docId: update_task_id,
                                    originalTitle: updateTaskTitle,
                                    updates: updatePayload
                                };

                                if (weekendAdjustment || explicitOverrideInfo) {
                                    updatePlanEntry.adjustments = {};
                                    if (weekendAdjustment) {
                                        updatePlanEntry.adjustments.plannedDate = weekendAdjustment;
                                    }
                                    if (explicitOverrideInfo) {
                                        updatePlanEntry.adjustments.explicitDateOverride = explicitOverrideInfo;
                                    }
                                }

                                if (explicitOverrideInfo) {
                                    const metadataPayload = {
                                        isoDate: explicitOverrideInfo.to,
                                        originalText: explicitOverrideInfo.originalText,
                                    };
                                    if (explicitOverrideInfo.requestedDate && explicitOverrideInfo.requestedDate !== explicitOverrideInfo.to) {
                                        metadataPayload.requestedDate = explicitOverrideInfo.requestedDate;
                                    }
                                    if (explicitOverrideInfo.rolledToFuture) {
                                        metadataPayload.rolledToFuture = true;
                                    }
                                    updatePlanEntry.metadata = {
                                        ...(updatePlanEntry.metadata || {}),
                                        explicitDateOverride: metadataPayload,
                                    };
                                }

                                if (planEntryNotes.length > 0) {
                                    updatePlanEntry.notes = planEntryNotes;
                                }

                                executionPlan.push(updatePlanEntry);
                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'title') && typeof updatePayload.title === 'string') {
                                    taskToUpdate.title = updatePayload.title;
                                }
                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'dependsOn')) {
                                    taskToUpdate.dependsOn = Array.isArray(updatePayload.dependsOn) ? [...updatePayload.dependsOn] : updatePayload.dependsOn;
                                }
                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'blocks')) {
                                    taskToUpdate.blocks = Array.isArray(updatePayload.blocks) ? [...updatePayload.blocks] : updatePayload.blocks;
                                }
                                if (Object.prototype.hasOwnProperty.call(updatePayload, 'blocked')) {
                                    taskToUpdate.blocked = updatePayload.blocked;
                                }
                                toolResult = `OK. Task "${updateTaskTitle}" marked for update.`;
                            } else {
                                toolResult = `Error: Task with ID "${update_task_id}" not found for update.`;
                            }
                            break;
                        }
                        case 'bulk_update_tasks':
                            const { updates: bulk_updates } = tool_code.parameters;
                            let updated_count = 0;
                            let not_found_ids = [];
                            for (const item of bulk_updates) {
                                const taskToUpdate = tasks.find(t => t.docId === item.task_id);
                                if (taskToUpdate) {
                                    const itemUpdates = { ...item.updates };
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'effort')) {
                                        const normalized = normalizeEffortValue(itemUpdates.effort);
                                        if (normalized) {
                                            itemUpdates.effort = normalized;
                                            taskToUpdate.effort = normalized;
                                        } else {
                                            delete itemUpdates.effort;
                                        }
                                    }

                                    executionPlan.push({
                                        action: "UPDATE",
                                        docId: item.task_id,
                                        originalTitle: taskToUpdate.title || 'Tarea sin título',
                                        updates: itemUpdates
                                    });
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'title') && typeof itemUpdates.title === 'string') {
                                        taskToUpdate.title = itemUpdates.title;
                                    }
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'plannedDate')) {
                                        taskToUpdate.plannedDate = itemUpdates.plannedDate;
                                    }
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'dependsOn')) {
                                        taskToUpdate.dependsOn = Array.isArray(itemUpdates.dependsOn) ? [...itemUpdates.dependsOn] : itemUpdates.dependsOn;
                                    }
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'blocks')) {
                                        taskToUpdate.blocks = Array.isArray(itemUpdates.blocks) ? [...itemUpdates.blocks] : itemUpdates.blocks;
                                    }
                                    if (Object.prototype.hasOwnProperty.call(itemUpdates, 'blocked')) {
                                        taskToUpdate.blocked = itemUpdates.blocked;
                                    }
                                    updated_count++;
                                } else {
                                    not_found_ids.push(item.task_id);
                                }
                            }
                            toolResult = `OK. Marked ${updated_count} tasks for update.`;
                            if (not_found_ids.length > 0) {
                                toolResult += ` Could not find tasks with IDs: ${not_found_ids.join(', ')}.`;
                            }
                            break;
                        case 'complete_task':
                            const { task_id: complete_task_id } = tool_code.parameters;
                            const taskToComplete = tasks.find(t => t.docId === complete_task_id);
                            if (taskToComplete) {
                                const updates = {
                                    status: 'done',
                                    isArchived: true,
                                    completedAt: new Date().toISOString()
                                };
                                executionPlan.push({ action: "UPDATE", docId: complete_task_id, updates, originalTitle: taskToComplete.title });
                                toolResult = `OK. Task "${taskToComplete.title}" marked as complete and archived.`;
                            } else {
                                toolResult = `Error: Task with ID "${complete_task_id}" not found to mark as complete.`;
                            }
                            break;
                        case 'find_tasks': {
                            const { filter } = tool_code.parameters;
                            const filterKeys = Object.keys(filter);
                            const foundTasks = tasks.filter(t => {
                                return filterKeys.every(key => {
                                    const filterValue = filter[key];
                                    if (key.endsWith('_lte')) {
                                        const field = key.replace('_lte', '');
                                        return t[field] && t[field] <= filterValue;
                                    }
                                    if (key.endsWith('_gte')) {
                                        const field = key.replace('_gte', '');
                                        return t[field] && t[field] >= filterValue;
                                    }
                                    if (key.endsWith('_ne')) {
                                        const field = key.replace('_ne', '');
                                        return t[field] !== filterValue;
                                    }
                                    if (key === 'title') {
                                        return t.title.toLowerCase().includes(filterValue.toLowerCase());
                                    }
                                    if (key === 'plannedDate' && filterValue === null) {
                                        return !t.plannedDate;
                                    }
                                    return t[key] === filterValue;
                                });
                            });

                            if (foundTasks.length > 0) {
                                foundTasksContext = foundTasks.map(t => ({ id: t.docId, title: t.title, status: t.status, plannedDate: t.plannedDate, dueDate: t.dueDate || null, effort: t.effort || 'medium' }));
                                const formattedTaskList = foundTasksContext
                                    .map(task => {
                                        const parts = [`Título: ${task.title}`];
                                        if (task.status) parts.push(`Estado: ${task.status}`);
                                        if (task.plannedDate) {
                                            parts.push(`Planificada: ${task.plannedDate}`);
                                        } else {
                                            parts.push('Sin fecha planificada');
                                        }
                                        if (task.dueDate) parts.push(`Vence: ${task.dueDate}`);
                                        if (task.effort) {
                                            const label = effortHumanLabels[task.effort] || task.effort;
                                            parts.push(`Esfuerzo: ${label}`);
                                        }
                                        return `- ${parts.join(' | ')}`;
                                    })
                                    .join('\n');
                                toolResult = `OK. Found ${foundTasks.length} tasks and saved them to the context.\n${formattedTaskList}`;
                            } else {
                                foundTasksContext = []; // Clear context if no tasks are found
                                toolResult = `Error: No tasks found for the given filter.`;
                            }
                            break;
                        }
                        default:
                            toolResult = `Error: Unknown tool "${tool_code.tool_id}".`;
                    }
                    } catch (e) {
                        toolResult = `Error executing tool: ${e.message}`;
                    }
                }

                conversationHistory.push({ role: 'model', parts: [{ text: JSON.stringify(agentResponse, null, 2) }] });
                conversationHistory.push({ role: 'user', parts: [{ text: `Observation: ${toolResult}` }] });
                if (tool_code.tool_id === 'find_tasks' && foundTasksContext.length > 0) {
                    conversationHistory.push({ role: 'user', parts: [{ text: `Contexto de tareas encontradas: ${JSON.stringify(foundTasksContext)}` }] });
                }
            }

            const weekendAdjustmentMessages = executionPlan.reduce((messages, action) => {
                const adjustment = action?.adjustments?.plannedDate;
                if (!adjustment) {
                    return messages;
                }

                const taskTitle = adjustment.taskTitle || action?.task?.title || action?.originalTitle || action?.docId || 'tarea';
                messages.push(`La fecha planificada de "${taskTitle}" se movió automáticamente de ${adjustment.fromWeekday} (${adjustment.from}) a ${adjustment.toWeekday} (${adjustment.to}) para evitar fines de semana.`);
                return messages;
            }, []);

            if (weekendAdjustmentMessages.length > 0) {
                const bulletMessages = weekendAdjustmentMessages.map(message => `* ${message}`).join('\n');
                summary = summary ? `${summary}\n${bulletMessages}` : bulletMessages;
            }

            if (explicitDateCorrections.length > 0 && !hasExplicitDateCorrectionInSummary) {
                const correctionMessages = explicitDateCorrections.map(correction => {
                    const taskTitle = correction.taskTitle || 'tarea';
                    const previous = correction.from ? ` (antes ${correction.from})` : ' (no tenía fecha previa)';
                    return `* Se corrigió la fecha de "${taskTitle}" a ${correction.to} para respetar "${correction.originalText}" indicado por el usuario${previous}.`;
                }).join('\n');
                if (correctionMessages) {
                    summary = summary ? `${summary}\n${correctionMessages}` : correctionMessages;
                    hasExplicitDateCorrectionInSummary = true;
                }
            }

            const connectors = ['Primero', 'Luego', 'Después', 'Más adelante', 'Finalmente'];
            const humanizedTool = toolCode => {
                if (!toolCode) return 'continuar con el siguiente paso';
                if (toolCode === 'answer_question') return 'dar una respuesta directa';
                if (toolCode === 'no_action_required') return 'dejar constancia de que no se requería acción';
                return `usar la herramienta "${toolCode}"`;
            };

            const finalThoughtProcess = thinkingSteps.map((step, i) => {
                const connector = connectors[Math.min(i, connectors.length - 1)];
                const actionDescription = humanizedTool(step.tool_code);
                return `${connector} pensé que ${step.thought}. Por eso decidí ${actionDescription}.`;
            }).join('\n\n');

            let finalThoughtProcessDisplay;
            if (summary) {
                const lastTool = thinkingSteps[thinkingSteps.length - 1]?.tool_code;
                if (lastTool === 'answer_question') {
                    finalThoughtProcessDisplay = `Aquí está mi respuesta detallada:\n\n${summary}`;
                } else {
                    finalThoughtProcessDisplay = `Este es el plan que tengo en mente:\n\n${summary}`;
                }
            } else {
                finalThoughtProcessDisplay = `Así estuve pensando los pasos a seguir:\n\n${finalThoughtProcess}`;
            }

            const planRequiresConfirmation = executionPlan.length > 0;
            const jobStatus = planRequiresConfirmation ? 'AWAITING_CONFIRMATION' : 'COMPLETED';

            await jobRef.update({
                status: jobStatus,
                thoughtProcess: finalThoughtProcessDisplay,
                executionPlan,
                summary: summary || "No se generó un resumen.",
                awaitingUserConfirmation: planRequiresConfirmation,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                conversationHistory,
                sanitySuggestions,
            });

            // After a successful run, save the plan to the cache if it's not from there already.
            if (jobData.requestHash && executionPlan.length > 0) {
                const db = admin.firestore();
                const cacheRef = db.collection('ai_plan_cache').doc(jobData.requestHash);
                await cacheRef.set({
                    executionPlan,
                    summary,
                    sanitySuggestions,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Save the final conversation history back to its document
            if (conversationId) {
                const db = admin.firestore();
                const conversationRef = db.collection('ai_conversations').doc(conversationId);
                await conversationRef.update({
                    history: conversationHistory,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

        } catch (error) {
            console.error(`Error running AI agent job ${context.params.jobId}:`, error);
            await jobRef.update({
                status: 'ERROR',
                error: `Agent job failed: ${error.message}`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });

const analyzePlanSanity = (data) => {

    const { plan, tasks } = data;
    if (!plan || !tasks || !Array.isArray(plan) || !Array.isArray(tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere 'plan' (array) y 'tasks' (array).");
    }

    const suggestions = [];
    const effortCost = { high: 5, medium: 3, low: 1 };
    const allowedEfforts = new Set(['low', 'medium', 'high']);
    const normalizeEffort = (value) => {
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim().toLowerCase();
        return allowedEfforts.has(normalized) ? normalized : null;
    };
    const dailyEffort = {};
    const dailyTaskCount = {};
    const tasksById = new Map(tasks.map(t => [t.docId, t]));

    // Calculate daily effort and task count from the plan
    plan.forEach(item => {
        if (item.action === 'UPDATE' && item.updates && item.updates.plannedDate) {
            const task = tasksById.get(item.docId);
            if (task) {
                const date = item.updates.plannedDate;
                const plannedEffort = normalizeEffort(item.updates.effort) || normalizeEffort(task.effort) || 'medium';
                const effort = effortCost[plannedEffort] || 3; // Default to medium
                dailyEffort[date] = (dailyEffort[date] || 0) + effort;
                dailyTaskCount[date] = (dailyTaskCount[date] || 0) + 1;
            }
        } else if (item.action === 'CREATE' && item.task && item.task.plannedDate) {
            const date = item.task.plannedDate;
            const plannedEffort = normalizeEffort(item.task.effort) || 'medium';
            const effort = effortCost[plannedEffort] || 3; // Default to medium
            dailyEffort[date] = (dailyEffort[date] || 0) + effort;
            dailyTaskCount[date] = (dailyTaskCount[date] || 0) + 1;
        }
    });

    // Check for overloaded days (by effort and by task count)
    for (const date in dailyEffort) {
        const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });
        if (dailyEffort[date] > 8) {
            suggestions.push(`El día ${formattedDate} parece sobrecargado en esfuerzo. Considera mover alguna tarea para balancear la semana.`);
        }
        if (dailyTaskCount[date] > 4) {
            suggestions.push(`El día ${formattedDate} tiene muchas tareas (${dailyTaskCount[date]}). Considera distribuir el trabajo para evitar el multitasking excesivo.`);
        }
    }

    // Check for tasks planned after their due date
    plan.forEach(item => {
        if (item.action === 'UPDATE' && item.updates && item.updates.plannedDate) {
            const task = tasksById.get(item.docId);
            if (task && task.dueDate && item.updates.plannedDate > task.dueDate) {
                suggestions.push(`La tarea "${task.title}" está planificada después de su fecha de vencimiento. Considera adelantarla.`);
            }
        } else if (item.action === 'CREATE' && item.task && item.task.plannedDate) {
            const { task } = item;
            if (task.dueDate && task.plannedDate > task.dueDate) {
                const taskTitle = task.title || 'tarea';
                suggestions.push(`La nueva tarea "${taskTitle}" está planificada después de su fecha de vencimiento. Considera adelantarla.`);
            }
        }
    });

    return { suggestions };
};
exports.analyzePlanSanity = analyzePlanSanity;


/**
 * Internal helper function to execute a task modification plan.
 * This is the core logic, extracted to be reusable by both the HTTPS callable function
 * and the Firestore-triggered agent runner.
 *
 * @param {admin.firestore.Firestore} db The Firestore database instance.
 * @param {Array<object>} plan The execution plan array.
 * @param {string} creatorUid The UID of the user who initiated the action.
 * @param {string|null} jobId The optional job ID for progress tracking.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const _executePlan = async (db, plan, creatorUid, jobId = null) => {
    if (!plan || !Array.isArray(plan)) {
        throw new Error("The 'plan' must be an array of actions.");
    }

    const batch = db.batch();
    const tempIdToRealIdMap = new Map();
    let progressRef = null;
    let progressSteps = [];

    // If a jobId is provided, set up the progress tracking document.
    if (jobId) {
        progressSteps = plan.map((action, index) => {
            let description = `Acción: ${action.action}`;
            if (action.originalTitle) {
                description = `"${action.originalTitle}"`;
            } else if (action.task && action.task.title) {
                description = `"${action.task.title}"`;
            }
            return { id: index, description, status: 'pending', action: action.action };
        });

        progressRef = db.collection('plan_executions').doc(jobId);
        await progressRef.set({
            status: 'running',
            steps: progressSteps,
            startedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const updateProgress = async (index, status, error = null) => {
        if (!progressRef) return;

        // First, update the local array state.
        progressSteps[index].status = status;
        if (error) {
            progressSteps[index].error = error;
        } else if (progressSteps[index].error) {
            delete progressSteps[index].error;
        }

        // Then, overwrite the entire array in Firestore with the updated local copy.
        // This is safe because _executePlan runs sequentially and is the only writer.
        await progressRef.update({
            steps: progressSteps
        });
    };

    let currentStepIndex = null;

    try {
        // --- Pre-process plan to resolve assignee emails to UIDs ---
        const emailToUidCache = new Map();
        const emailsToFetch = new Set();
        plan.forEach(action => {
            if (action.action === 'CREATE' && action.task.assigneeEmail) {
                emailsToFetch.add(action.task.assigneeEmail);
            } else if (action.action === 'UPDATE' && action.updates.assigneeEmail) {
                emailsToFetch.add(action.updates.assigneeEmail);
            }
        });

        if (emailsToFetch.size > 0) {
            const usersQuery = await db.collection('usuarios').where('email', 'in', Array.from(emailsToFetch)).get();
            usersQuery.forEach(doc => {
                emailToUidCache.set(doc.data().email, doc.id);
            });
        }

        // --- First Pass: Create new tasks and map IDs ---
        for (let i = 0; i < plan.length; i++) {
            const action = plan[i];
            if (action.action === 'CREATE') {
                currentStepIndex = i;
                await updateProgress(i, 'running');
                const newTaskRef = db.collection('tareas').doc();
                const taskData = {
                    ...action.task,
                    creatorUid: creatorUid, // Use the provided creatorUid
                    createdAt: new Date(),
                    status: 'todo',
                    isProjectTask: action.task.isProjectTask || false
                };

                // --- Defensive Programming: Prevent undefined values ---
                for (const key in taskData) {
                    if (taskData[key] === undefined) {
                        delete taskData[key];
                    }
                }

                const explicitOverride = action?.metadata?.explicitDateOverride;
                const hasExplicitOverride = Boolean(explicitOverride?.isoDate);
                if (hasExplicitOverride) {
                    taskData.plannedDate = explicitOverride.isoDate;
                }

                if (taskData.assigneeEmail) {
                    const assigneeUid = emailToUidCache.get(taskData.assigneeEmail);
                    if (assigneeUid) {
                        taskData.assigneeUid = assigneeUid;
                    }
                    delete taskData.assigneeEmail;
                }

                if (taskData.plannedDate && !hasExplicitOverride) {
                    const { normalizedDate } = normalizePlannedDate(taskData.plannedDate);
                    if (normalizedDate) {
                        taskData.plannedDate = normalizedDate;
                    }
                } else if (hasExplicitOverride) {
                    taskData.plannedDate = explicitOverride.isoDate;
                }

                // --- Final Date Derivation ---
                // This runs *after* all overrides and normalizations.
                if (taskData.isProjectTask && taskData.plannedDate) {
                    taskData.startDate = taskData.plannedDate;
                    if (!taskData.dueDate) {
                        taskData.dueDate = taskData.plannedDate;
                    }
                }

                batch.set(newTaskRef, taskData);
                tempIdToRealIdMap.set(action.docId, newTaskRef.id);
                await updateProgress(i, 'completed');
            }
        }

        // --- Second Pass: Apply updates, deletions, and dependencies ---
        for (let i = 0; i < plan.length; i++) {
            const action = plan[i];
            if (action.action === 'UPDATE') {
                currentStepIndex = i;
                await updateProgress(i, 'running');
                const realDocId = tempIdToRealIdMap.get(action.docId) || action.docId;
                const taskRef = db.collection('tareas').doc(realDocId);
                const resolvedUpdates = {...action.updates};

                if (typeof resolvedUpdates.isProjectTask !== 'boolean') {
                    delete resolvedUpdates.isProjectTask;
                }
                const explicitOverride = action?.metadata?.explicitDateOverride;
                const hasExplicitOverride = Boolean(explicitOverride?.isoDate) && Object.prototype.hasOwnProperty.call(resolvedUpdates, 'plannedDate');
                if (hasExplicitOverride) {
                    resolvedUpdates.plannedDate = explicitOverride.isoDate;
                }

                if (resolvedUpdates.assigneeEmail) {
                    const assigneeUid = emailToUidCache.get(resolvedUpdates.assigneeEmail);
                    if (assigneeUid) {
                        resolvedUpdates.assigneeUid = assigneeUid;
                    }
                    delete resolvedUpdates.assigneeEmail;
                }

                if (resolvedUpdates.plannedDate && !hasExplicitOverride) {
                    const { normalizedDate } = normalizePlannedDate(resolvedUpdates.plannedDate);
                    if (normalizedDate) {
                        resolvedUpdates.plannedDate = normalizedDate;
                    }
                } else if (hasExplicitOverride) {
                    resolvedUpdates.plannedDate = explicitOverride.isoDate;
                }

                // --- Final Date Derivation ---
                // This runs *after* all overrides and normalizations.
                if (resolvedUpdates.isProjectTask && resolvedUpdates.plannedDate) {
                    resolvedUpdates.startDate = resolvedUpdates.plannedDate;
                    // Only set dueDate if it's not already being updated to something else.
                    if (!resolvedUpdates.dueDate) {
                        resolvedUpdates.dueDate = resolvedUpdates.plannedDate;
                    }
                }

                const finalUpdates = {};
                for (const key in resolvedUpdates) {
                    const value = resolvedUpdates[key];
                    // --- Defensive Programming: Prevent undefined values ---
                    if (value === undefined) {
                        continue; // Skip undefined values to prevent Firestore errors
                    }
                    if (key === 'dependsOn' || key === 'blocks') {
                        const resolvedIds = value.map(id => tempIdToRealIdMap.get(id) || id);
                        finalUpdates[key] = admin.firestore.FieldValue.arrayUnion(...resolvedIds);
                    } else {
                        finalUpdates[key] = value;
                    }
                }
                batch.update(taskRef, finalUpdates);
                await updateProgress(i, 'completed');
            } else if (action.action === 'DELETE') {
                currentStepIndex = i;
                await updateProgress(i, 'running');
                const taskRef = db.collection('tareas').doc(action.docId);
                batch.delete(taskRef);
                await updateProgress(i, 'completed');
            }
        }

        await batch.commit();

        if (progressRef) {
            await progressRef.update({
                status: 'completed',
                steps: progressSteps,
                finishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        return { success: true, message: "Plan ejecutado con éxito." };

    } catch (error) {
        if (currentStepIndex !== null && plan[currentStepIndex]) {
            const failedAction = plan[currentStepIndex];
            console.error(`Error executing task modification plan at step ${currentStepIndex}:`, JSON.stringify(failedAction, null, 2), "Error:", error);
        } else {
            console.error("Error executing task modification plan (step unknown):", error);
        }

        if (progressRef) {
            if (currentStepIndex !== null) {
                await updateProgress(currentStepIndex, 'error', error.message);
            }
            await progressRef.update({
                status: 'error',
                error: error.message,
                steps: progressSteps,
                finishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        // Re-throw the error to be caught by the calling function
        throw error;
    }
};


/**
 * Executes a multi-step plan generated by the AI assistant.
 * This is an HTTPS callable function that acts as a wrapper around the core `_executePlan` logic.
 */
exports.executeTaskModificationPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan, jobId } = data;
    const db = admin.firestore();

    try {
        const result = await _executePlan(db, plan, context.auth.uid, jobId);

        if (jobId) {
            const jobRef = db.collection('ai_agent_jobs').doc(jobId);
            await jobRef.set({
                status: 'COMPLETED',
                awaitingUserConfirmation: false,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                resultSummary: result?.message || 'Plan ejecutado con éxito.'
            }, { merge: true });
        }

        return result;
    } catch (error) {
        if (jobId) {
            const jobRef = db.collection('ai_agent_jobs').doc(jobId);
            await jobRef.set({
                status: 'ERROR',
                awaitingUserConfirmation: false,
                error: error.message
            }, { merge: true });
        }
        // The error is already logged by _executePlan.
        // We just need to throw the appropriate HttpsError.
        throw new functions.https.HttpsError("internal", "Ocurrió un error al ejecutar el plan.", error.message);
    }
});


/**
 * Scheduled function to delete archived tasks older than 6 months.
 * Runs every day at 3:00 AM (Argentina time).
 */
exports.deleteOldArchivedTasks = functions.pubsub.schedule("every day 03:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    console.log("Running scheduled task: Deleting old archived tasks...");

    const db = admin.firestore();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tasksRef = db.collection("tareas");
    const q = query(tasksRef,
        where('isArchived', '==', true),
        where('completedAt', '<', sixMonthsAgo)
    );

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            console.log("No old archived tasks to delete.");
            return null;
        }

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Successfully deleted ${querySnapshot.size} old archived tasks.`);
        return null;
    } catch (error) {
        console.error("Error deleting old archived tasks:", error);
        return null;
    }
});

// CORRECTED SYNTAX
exports.sendTaskNotification = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .firestore.document('tareas/{taskId}')
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // --- Task Unblocking Logic ---
    // Exit if the task status hasn't changed to 'done' or if it's a new task
    if (beforeData && beforeData.status !== 'done' && afterData.status === 'done') {
        const blockedTaskIds = afterData.blocks;
        if (blockedTaskIds && blockedTaskIds.length > 0) {
            console.log(`Task ${context.params.taskId} completed. Checking for tasks to unblock.`);
            const db = admin.firestore();
            const batch = db.batch();
            const completedTaskId = context.params.taskId;

            const unblockPromises = blockedTaskIds.map(async (blockedTaskId) => {
                const blockedTaskRef = db.collection('tareas').doc(blockedTaskId);
                try {
                    await db.runTransaction(async (transaction) => {
                        const blockedTaskDoc = await transaction.get(blockedTaskRef);
                        if (!blockedTaskDoc.exists) return;

                        const blockedTaskData = blockedTaskDoc.data();
                        const dependsOn = (blockedTaskData.dependsOn || []).filter(id => id !== completedTaskId);
                        const updates = { dependsOn };

                        if (dependsOn.length === 0) {
                            updates.blocked = false;
                            console.log(`Unblocking task ${blockedTaskId}.`);
                            if (blockedTaskData.assigneeUid) {
                                const message = `La tarea "${blockedTaskData.title}" ha sido desbloqueada y ya está lista para empezar.`;
                                const notification = {
                                    userId: blockedTaskData.assigneeUid,
                                    message,
                                    view: 'tareas',
                                    params: { taskId: blockedTaskId },
                                    createdAt: new Date(),
                                    isRead: false,
                                };
                                const notificationRef = db.collection('notifications').doc();
                                // Set notification in the same transaction to ensure atomicity
                                transaction.set(notificationRef, notification);
                            }
                        }
                        transaction.update(blockedTaskRef, updates);
                    });
                } catch (error) {
                    console.error(`Error in transaction for unblocking task ${blockedTaskId}:`, error);
                }
            });
            await Promise.all(unblockPromises);
        }
    }

    // ... other onWrite logic can go here ...

    return null;
  });

// CORRECTED SYNTAX
exports.sendTestTelegramMessage = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .https.onCall(async (data, context) => {
    // ... function logic
  });

exports.updateCollectionCounts = functions.firestore
  .document('{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    // ... function logic
});

exports.listModels = functions.https.onCall(async (data, context) => {
    // ... function logic
});

exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });

exports.getCurrentDateForUserTZ = getCurrentDateForUserTZ;

if (process.env.NODE_ENV === 'test') {
    module.exports._executePlan = _executePlan;
    module.exports.extractExplicitDatesFromPrompt = extractExplicitDatesFromPrompt;
    module.exports.generateRequestHash = generateRequestHash;
}
