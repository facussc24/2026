#!/usr/bin/env node

import admin from 'firebase-admin';
import process from 'process';

const args = new Set(process.argv.slice(2));

if (args.has('--help')) {
    console.log(`Uso: node scripts/migrate_tasks_to_new_schema.js [--commit]\n\n` +
        'Sin --commit realiza un dry-run y solo informa los cambios necesarios.');
    process.exit(0);
}

const shouldCommit = args.has('--commit');

function mapLegacyPriorityToPlanner(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (['low', 'baja', 'l'].includes(normalized)) return 'low';
    if (['high', 'alta', 'h'].includes(normalized)) return 'high';
    if (['medium', 'med', 'media', 'm'].includes(normalized)) return 'med';
    return 'med';
}

function mapPlannerPriorityToLegacy(code) {
    if (code === 'low') return 'low';
    if (code === 'high') return 'high';
    return 'medium';
}

function normalizeStatus(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (!normalized) {
        return 'todo';
    }
    if (['inprogress', 'in_progress', 'progress', 'doing'].includes(normalized)) {
        return 'inprogress';
    }
    if (['done', 'completed', 'complete', 'terminada', 'terminado'].includes(normalized)) {
        return 'done';
    }
    if (['todo', 'pendiente', 'por hacer'].includes(normalized)) {
        return 'todo';
    }
    return 'todo';
}

function isEmpty(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

async function ensureFirebase() {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
        });
    }
    return admin.firestore();
}

function buildUpdate(data) {
    const update = {};
    const reasons = [];

    const hasResource = Object.prototype.hasOwnProperty.call(data, 'resource') && !isEmpty(data.resource);
    if (!hasResource) {
        const resolved = data.assignedTo ?? data.assigneeUid ?? null;
        update.resource = resolved ?? null;
        reasons.push('resource');
    }

    const priorityCode = !isEmpty(data.priorityCode) ? data.priorityCode : null;
    const priorityLegacy = !isEmpty(data.priority) ? data.priority : null;
    const plannerPriority = mapLegacyPriorityToPlanner(priorityCode ?? priorityLegacy);
    const shouldSetPriorityCode = isEmpty(priorityCode);
    const shouldSetPriorityLegacy = isEmpty(priorityLegacy);
    if (shouldSetPriorityCode || shouldSetPriorityLegacy) {
        if (shouldSetPriorityCode) {
            update.priorityCode = plannerPriority;
        }
        if (shouldSetPriorityLegacy) {
            update.priority = mapPlannerPriorityToLegacy(plannerPriority);
        }
        reasons.push('priority');
    }

    const hasStatus = Object.prototype.hasOwnProperty.call(data, 'status') && !isEmpty(data.status);
    if (!hasStatus) {
        update.status = normalizeStatus(data.status);
        reasons.push('status');
    }

    return { update, reasons };
}

async function main() {
    try {
        const db = await ensureFirebase();
        const tasksRef = db.collection('tareas');
        const snapshot = await tasksRef.get();

        if (snapshot.empty) {
            console.log('No se encontraron tareas en la colección "tareas".');
            process.exit(0);
        }

        const pending = [];
        for (const doc of snapshot.docs) {
            const data = doc.data() || {};
            const { update, reasons } = buildUpdate(data);
            if (reasons.length > 0) {
                pending.push({ id: doc.id, update, reasons });
            }
        }

        if (pending.length === 0) {
            console.log('Todas las tareas ya cumplen con el esquema nuevo.');
            process.exit(0);
        }

        console.log(`Tareas que requieren normalización: ${pending.length}`);
        pending.slice(0, 20).forEach((item, index) => {
            console.log(`- ${item.id}: campos ${item.reasons.join(', ')}`);
            console.log('  → cambios propuestos:', JSON.stringify(item.update));
            if (index === 19 && pending.length > 20) {
                console.log(`  ... y ${pending.length - 20} tareas más.`);
            }
        });

        if (!shouldCommit) {
            console.log('\nDry-run completo. Re-ejecutá con --commit para aplicar los cambios.');
            process.exit(0);
        }

        console.log('\nAplicando cambios...');
        let batch = db.batch();
        let batchSize = 0;
        let applied = 0;
        for (const item of pending) {
            const docRef = tasksRef.doc(item.id);
            batch.update(docRef, item.update);
            batchSize += 1;
            applied += 1;
            if (batchSize === 450) {
                await batch.commit();
                batch = db.batch();
                batchSize = 0;
            }
        }
        if (batchSize > 0) {
            await batch.commit();
        }

        console.log(`Normalización completada. Se actualizaron ${applied} tareas.`);
    } catch (error) {
        console.error('La migración falló:', error);
        process.exit(1);
    }
}

main();
