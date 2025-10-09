# Migración: campo `showInPlanning` en la colección `tareas`

Las tareas ahora incluyen un flag booleano `showInPlanning` que controla si un documento debe aparecer en la vista de timeline/planning. Las nuevas tareas lo inicializan automáticamente en `false`, pero los documentos existentes necesitan un valor explícito para evitar que el filtro falle.

## Actualización desde la consola de Firebase

1. Abre [Firebase Console](https://console.firebase.google.com/) y navega a **Firestore Database → Data**.
2. Abre las herramientas de desarrollador del navegador (pestaña **Console**).
3. Ejecuta el siguiente script. Procesa los documentos en lotes de hasta 400 para respetar el límite de escritura por batch:

```js
(async () => {
  const db = firebase.firestore();
  const snapshot = await db.collection('tareas').get();
  const refsToUpdate = snapshot.docs
    .filter(doc => doc.data().showInPlanning === undefined)
    .map(doc => doc.ref);

  console.log(`Documentos sin showInPlanning: ${refsToUpdate.length}`);

  while (refsToUpdate.length) {
    const batch = db.batch();
    refsToUpdate.splice(0, 400).forEach(ref => {
      batch.update(ref, { showInPlanning: false });
    });
    await batch.commit();
  }

  console.log('Migración completada.');
})();
```

> **Nota:** Si utilizas un entorno donde `firebase` no está disponible de forma global, ejecuta primero `const firebase = window.firebase;`.

El script ignora los documentos que ya tienen `showInPlanning` definido, por lo que es seguro ejecutarlo múltiples veces.
