const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');

admin.initializeApp();

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

exports.saveFormWithValidation = functions.https.onRequest((req, res) => {
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

exports.sendTaskAssignmentEmail = functions.firestore
  .document('tareas/{taskId}')
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

exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires") // Ajusta a tu zona horaria
  .onRun(async (context) => {
    console.log("Ejecutando la revisión de recordatorios diarios.");

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Telegram token or chat ID not set.");
        return null;
    }

    const db = admin.firestore();
    const recordatoriosRef = db.collection("recordatorios");

    // Obtenemos la fecha de hoy para comparar
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Inicio del día

    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1); // Fin del día (inicio de mañana)

    try {
      // Buscamos recordatorios cuya fecha de vencimiento sea hoy
      const snapshot = await recordatoriosRef
        .where("fechaVencimiento", ">=", hoy)
        .where("fechaVencimiento", "<", manana)
        .get();

      if (snapshot.empty) {
        console.log("No se encontraron recordatorios para hoy.");
        return null;
      }

      // Para cada recordatorio encontrado, enviamos un mensaje
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
