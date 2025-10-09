/**
 * Migration script to convert task date strings into Firestore Timestamps.
 *
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service account JSON.
 *   2. From the `functions/` directory run:
 *        node scripts/migrate-task-date-timestamps.js
 *
 * The script scans the `tareas` collection and updates the `startDate`,
 * `dueDate`, and `endDate` fields when they are stored as strings or plain
 * JavaScript Date instances.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const { Timestamp } = admin.firestore;

function parseDateInput(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Timestamp) {
        return null;
    }
    if (value instanceof Date) {
        const clone = new Date(value.getTime());
        clone.setHours(0, 0, 0, 0);
        return clone;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const isoCandidate = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`);
        if (!Number.isNaN(isoCandidate.getTime())) {
            isoCandidate.setHours(0, 0, 0, 0);
            return isoCandidate;
        }
        const fallback = new Date(trimmed);
        if (!Number.isNaN(fallback.getTime())) {
            fallback.setHours(0, 0, 0, 0);
            return fallback;
        }
        return null;
    }
    if (value && typeof value.toDate === 'function') {
        try {
            const converted = value.toDate();
            if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
                const clone = new Date(converted.getTime());
                clone.setHours(0, 0, 0, 0);
                return clone;
            }
        } catch (error) {
            return null;
        }
    }
    if (typeof value === 'object' && value !== null && typeof value.seconds === 'number') {
        const millis = value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime())) {
            date.setHours(0, 0, 0, 0);
            return date;
        }
    }
    return null;
}

function toTimestampIfNeeded(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
        return null;
    }
    return Timestamp.fromDate(parsed);
}

async function migrateTaskDates() {
    console.log('Starting task date migration...');
    const snapshot = await db.collection('tareas').get();
    let batch = db.batch();
    let operationsInBatch = 0;
    let updatedDocuments = 0;
    let skippedDocuments = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const updates = {};

        ['startDate', 'dueDate', 'endDate'].forEach((field) => {
            if (!Object.prototype.hasOwnProperty.call(data, field)) {
                return;
            }
            const converted = toTimestampIfNeeded(data[field]);
            if (converted) {
                updates[field] = converted;
            }
        });

        if (Object.keys(updates).length === 0) {
            skippedDocuments += 1;
            continue;
        }

        batch.update(doc.ref, updates);
        operationsInBatch += 1;
        updatedDocuments += 1;

        if (operationsInBatch >= 400) {
            await batch.commit();
            batch = db.batch();
            operationsInBatch = 0;
        }
    }

    if (operationsInBatch > 0) {
        await batch.commit();
    }

    console.log(`Migration complete. Updated ${updatedDocuments} documents, skipped ${skippedDocuments}.`);
}

migrateTaskDates()
    .then(() => {
        console.log('Task date migration finished successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Task date migration failed:', error);
        process.exit(1);
    });
