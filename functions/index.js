/**
 * @file Cloud Functions for Firebase.
 * @author The Developer
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');

admin.initializeApp();

/**
 * Nodemailer transporter for sending emails.
 * Configured using environment variables for security.
 * @type {import('nodemailer').Transporter}
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Generates the next sequential ECR (Engineering Change Request) number.
 * This is a callable function that ensures unique, sequential numbering
 * based on the current year (e.g., ECR-2024-001).
 * It uses a Firestore transaction to guarantee atomicity and prevent race conditions.
 * @name getNextEcrNumber
 * @param {object} data - The data passed to the function (not used).
 * @param {functions.https.CallableContext} context - The context of the call, including authentication information.
 * @returns {Promise<{ecrNumber: string}>} A promise that resolves to an object containing the new ECR number.
 * @throws {functions.https.HttpsError} Throws 'unauthenticated' if the user is not logged in.
 * @throws {functions.https.HttpsError} Throws 'internal' on any unexpected server error.
 */
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
        // If the counter is for the current year, increment it.
        // Otherwise, reset it for the new year.
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }

      // Update the counter in the transaction.
      transaction.set(
          counterRef,
          {count: nextNumber, year: currentYear},
          {merge: true},
      );

      // Return the formatted ECR number.
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

/**
 * Saves and validates ECR (Engineering Change Request) or ECO (Engineering Change Order) forms.
 * This function acts as a secure endpoint for form submissions.
 *
 * It performs the following actions:
 * 1. Authenticates the user via an ID token.
 * 2. Validates required fields based on the form type ('ecr' or 'eco').
 * 3. Saves the form data to the corresponding Firestore collection ('ecr_forms' or 'eco_forms').
 * 4. Creates a history record of the change.
 * 5. Sends an email notification to the form creator if the status of the form changes.
 *
 * @name saveFormWithValidation
 * @type {functions.HttpsFunction}
 * @param {functions.https.Request} req - The HTTP request object. Expected body format: `{ data: { formType: string, formData: object } }`.
 * @param {functions.Response} res - The HTTP response object.
 * @returns {void}
 */
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

/**
 * Firestore trigger that sends an email notification when a new task is created.
 * The email is sent to the user specified in the task's `assigneeUid` field.
 * @name sendTaskAssignmentEmail
 * @param {functions.firestore.QueryDocumentSnapshot} snap - The snapshot of the created document.
 * @param {functions.EventContext} context - The context of the event.
 * @returns {Promise<null>} A promise that resolves when the function is complete.
 */
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

/**
 * Firestore trigger that sends a Telegram notification when a task is created or its status changes.
 * - On task creation, notifies the assignee.
 * - On status change, notifies the creator.
 * The user's Telegram Chat ID must be stored in their user profile in the 'usuarios' collection.
 * @name sendTaskNotification
 * @param {functions.Change<functions.firestore.DocumentSnapshot>} change - Object containing the document snapshots before and after the change.
 * @param {functions.EventContext} context - The context of the event, including document wildcard parameters.
 * @returns {Promise<null>} A promise that resolves when the function is complete.
 */
exports.sendTaskNotification = functions
  .runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .firestore.document('tareas/{taskId}')
  .onWrite(async (change, context) => {
    const beforeData = change.before.exists ? change.before.data() : null;
    const afterData = change.after.exists ? change.after.data() : null;

    if (!afterData) {
      console.log(`Task ${context.params.taskId} deleted. No notification sent.`);
      return null;
    }

    const taskId = context.params.taskId;
    let message = null;
    let targetUid = null;

    const wasJustCreated = !beforeData && afterData;
    const statusChanged = beforeData && afterData.status !== beforeData.status;

    // Notification for New Task Assignment
    if (wasJustCreated && afterData.assigneeUid) {
        targetUid = afterData.assigneeUid;
        const creator = await admin.auth().getUser(afterData.creatorUid);
        message = `🔔 *Nueva Tarea Asignada*\n\n*Tarea:* ${afterData.title}\n*Asignada por:* ${creator.displayName || creator.email}`;
    }
    // Notification for Task Status Change
    else if (statusChanged && afterData.creatorUid) {
        targetUid = afterData.creatorUid;
        const assignee = afterData.assigneeUid ? await admin.auth().getUser(afterData.assigneeUid) : null;
        const assigneeName = assignee ? (assignee.displayName || assignee.email) : 'Nadie';
        message = `✅ *Actualización de Tarea*\n\nLa tarea *${afterData.title}* que creaste ha cambiado su estado a *${afterData.status}* por ${assigneeName}.`;
    }

    if (!message || !targetUid) {
      console.log(`No notification condition met for task ${taskId}.`);
      return null;
    }

    try {
      const userDoc = await admin.firestore().collection('usuarios').doc(targetUid).get();
      if (!userDoc.exists) {
        console.log(`User document for UID ${targetUid} not found.`);
        return null;
      }

      const userData = userDoc.data();
      const telegramChatId = userData.telegramChatId;

      if (!telegramChatId) {
        console.log(`User ${targetUid} has not configured their Telegram Chat ID.`);
        return null;
      }

      const notificationPrefs = userData.telegramNotifications || {};
      if (wasJustCreated && notificationPrefs.onAssignment === false) {
          console.log(`User ${targetUid} has disabled 'onAssignment' notifications.`);
          return null;
      }
      if (statusChanged && notificationPrefs.onStatusChange === false) {
          console.log(`User ${targetUid} has disabled 'onStatusChange' notifications.`);
          return null;
      }

      const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

      await axios.post(url, {
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      });

      console.log(`Telegram notification sent to user ${targetUid} for task ${taskId}.`);
      return null;

    } catch (error) {
      console.error(`Failed to send Telegram notification for task ${taskId}:`, error);
      if (error.response) {
        console.error('Telegram API Error:', error.response.data);
      }
      return null;
    }
  });

/**
 * Sends a test message to the authenticated user's configured Telegram chat ID.
 * This is a callable function used to verify that the Telegram integration is working for a user.
 * @name sendTestTelegramMessage
 * @param {object} data - The data passed to the function (not used).
 * @param {functions.https.CallableContext} context - The context of the call, including authentication information.
 * @returns {Promise<{success: boolean, message: string}>} A promise that resolves to a success object.
 * @throws {functions.https.HttpsError} Throws 'unauthenticated' if the user is not logged in.
 * @throws {functions.https.HttpsError} Throws 'not-found' if the user document doesn't exist.
 * @throws {functions.https.HttpsError} Throws 'failed-precondition' if the Telegram chat ID is not set.
 * @throws {functions.https.HttpsError} Throws 'internal' on any unexpected server error.
 */
exports.sendTestTelegramMessage = functions
  .runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    const uid = context.auth.uid;

    try {
      const userDoc = await admin.firestore().collection("usuarios").doc(uid).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError("not-found", "User document not found.");
      }
      const telegramChatId = userDoc.data().telegramChatId;

      if (!telegramChatId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "El Chat ID de Telegram no está configurado para este usuario."
        );
      }

      const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
      const message = "¡Hola! 👋 Esta es una prueba de notificación de Telegram desde Gestión PRO. ¡La configuración funciona!";

      await axios.post(url, {
        chat_id: telegramChatId,
        text: message,
        parse_mode: "Markdown",
      });

      console.log(`Test message sent to user ${uid} at chat ID ${telegramChatId}`);
      return { success: true, message: "Mensaje de prueba enviado con éxito." };

    } catch (error) {
      console.error(`Error sending test message to user ${uid}:`, error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Ocurrió un error inesperado al enviar el mensaje de prueba."
      );
    }
  });

/**
 * Firestore trigger that maintains a count of documents in key collections.
 * This is used to power a KPI dashboard by keeping an aggregate count document
 * up-to-date without needing to perform expensive count queries on the client.
 * The collections being counted are hardcoded in `collectionsToCount`.
 * @name updateCollectionCounts
 * @param {functions.Change<functions.firestore.DocumentSnapshot>} change - Object containing the document snapshots before and after the change.
 * @param {functions.EventContext} context - The context of the event, including document wildcard parameters.
 * @returns {Promise<null|admin.firestore.WriteResult>} A promise that resolves when the function is complete.
 */
exports.updateCollectionCounts = functions.firestore
  .document('{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    const collectionId = context.params.collectionId;
    const collectionsToCount = ['productos', 'insumos', 'proyectos', 'tareas'];

    if (!collectionsToCount.includes(collectionId)) {
        return null;
    }

    const db = admin.firestore();
    const collectionRef = db.collection(collectionId);
    const snapshot = await collectionRef.count().get();
    const count = snapshot.data().count;

    const counterRef = db.collection('counters').doc('kpi_counts');

    console.log(`Updating count for ${collectionId} to ${count}`);

    return counterRef.set({
        [collectionId]: count
    }, { merge: true });
});

/**
 * A scheduled function that runs every day at 09:00 (America/Argentina/Buenos_Aires)
 * to send daily reminders for tasks or events due on the current day.
 * It queries the 'recordatorios' collection and sends a Telegram message for each due item.
 * @name enviarRecordatoriosDiarios
 * @param {functions.EventContext} context - The context of the scheduled event.
 * @returns {Promise<null>} A promise that resolves when the function is complete.
 */
exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires") // Ajusta a tu zona horaria
  .onRun(async (context) => {
    console.log("Ejecutando la revisión de recordatorios diarios.");

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // This seems to be a global chat ID, not user-specific

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Telegram token or global chat ID not set.");
        return null;
    }

    const db = admin.firestore();
    const recordatoriosRef = db.collection("recordatorios");

    // Get today's date range
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Start of day

    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1); // End of day (start of tomorrow)

    try {
      // Find reminders with a due date of today
      const snapshot = await recordatoriosRef
        .where("fechaVencimiento", ">=", hoy)
        .where("fechaVencimiento", "<", manana)
        .get();

      if (snapshot.empty) {
        console.log("No se encontraron recordatorios para hoy.");
        return null;
      }

      // For each reminder found, send a message
      for (const doc of snapshot.docs) {
        const recordatorio = doc.data();
        const mensaje = `🔔 ¡Recordatorio! Hoy vence: ${recordatorio.descripcion}`;

        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await axios.post(url, {
          chat_id: TELEGRAM_CHAT_ID,
          text: mensaje,
        });
        console.log(`Mensaje enviado para: ${recordatorio.descripcion}`);
      }

      return null;

    } catch (error) {
      console.error("Error al procesar recordatorios:", error);
      return null;
    }
  });
