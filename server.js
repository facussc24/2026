const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// Directorios y archivos para almacenar datos
const DATA_DIR = path.join(__dirname, 'data');
const DOCS_FILE = path.join(DATA_DIR, 'docs.json');
const DOCS_DIR = path.join(DATA_DIR, 'amfes');

// Inicializa directorios de datos si no existen
async function ensureDataDirs() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  try {
    await fs.access(DOCS_FILE);
  } catch (err) {
    await fs.writeFile(DOCS_FILE, '[]', 'utf8');
  }
}

// Carga la lista de documentos (metadatos)
async function loadDocs() {
  await ensureDataDirs();
  const raw = await fs.readFile(DOCS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (ex) {
    return [];
  }
}

// Guarda la lista de documentos
async function saveDocs(docs) {
  await ensureDataDirs();
  await fs.writeFile(DOCS_FILE, JSON.stringify(docs, null, 2), 'utf8');
}

// Ruta a un documento AMFE individual
function docPath(id) {
  return path.join(DOCS_DIR, `${id}.json`);
}

const app = express();

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));
// Analizar cuerpos JSON
app.use(express.json({ limit: '10mb' }));

// Obtener todos los documentos
app.get('/api/docs', async (req, res) => {
  try {
    const docs = await loadDocs();
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar documentos' });
  }
});

// Crear un nuevo documento
app.post('/api/docs', async (req, res) => {
  try {
    const docs = await loadDocs();
    const id = 'doc' + Date.now();
    const meta = {
      id,
      name: req.body.name || 'Nuevo AMFE',
      lastModified: new Date().toISOString(),
    };
    docs.push(meta);
    await saveDocs(docs);
    // Guardar contenido inicial del documento
    const content = req.body.content || {
      general: {
        orgName: '', tema: '', numeroAmfe: '', revisionAmfe: '', planta: '', fechaInicio: '', responsable: '', cliente: '', fechaRevision: '', confidencialidad: '', modelo: '', equipo: '', planNumber: '', contacto: '', tipoPlan: '', numParte: '', ultimoCambio: '', aprobProv: '', aprobIngCliente: '', aprobCalidadCliente: '', aprobOtras: ''
      },
      items: [],
      selected: { itemId: null, stepId: null, elementId: null }
    };
    await fs.writeFile(docPath(id), JSON.stringify(content, null, 2), 'utf8');
    res.json(meta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

// Obtener un documento por ID
app.get('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const raw = await fs.readFile(docPath(id), 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(404).json({ error: 'Documento no encontrado' });
  }
});

// Actualizar un documento
app.put('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const docs = await loadDocs();
    const idx = docs.findIndex(d => d.id === id);
    if (idx < 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    // Actualizar metadatos
    if (req.body.name) docs[idx].name = req.body.name;
    docs[idx].lastModified = new Date().toISOString();
    await saveDocs(docs);
    // Actualizar contenido
    if (req.body.content) {
      await fs.writeFile(docPath(id), JSON.stringify(req.body.content, null, 2), 'utf8');
    }
    res.json(docs[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// Eliminar un documento
app.delete('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let docs = await loadDocs();
    const idx = docs.findIndex(d => d.id === id);
    if (idx < 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    docs.splice(idx, 1);
    await saveDocs(docs);
    // Borrar archivo de contenido
    try {
      await fs.unlink(docPath(id));
    } catch (ex) {
      /* ignorar si no existe */
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor AMFE escuchando en http://localhost:${PORT}`);
});