/**
 * AMFE-FMEA Process Analysis Tool - Backend Server
 * 
 * This server provides a REST API for managing AMFE/FMEA documents.
 * It uses file-based storage with JSON files.
 * 
 * Note: This implementation is designed for local/single-server use.
 * For production deployment with multiple servers, consider migrating to Firebase or another cloud database.
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// Configuration: Data directories and files
const DATA_DIR = path.join(__dirname, 'data');
const DOCS_FILE = path.join(DATA_DIR, 'docs.json');
const DOCS_DIR = path.join(DATA_DIR, 'amfes');

/**
 * Ensures that data directories and files exist.
 * Creates them if they don't exist.
 * @returns {Promise<void>}
 */
async function ensureDataDirs() {
  try {
    await fs.mkdir(DOCS_DIR, { recursive: true });
    try {
      await fs.access(DOCS_FILE);
    } catch (err) {
      // File doesn't exist, create it with empty array
      await fs.writeFile(DOCS_FILE, '[]', 'utf8');
    }
  } catch (error) {
    console.error('Error ensuring data directories:', error);
    throw error;
  }
}

/**
 * Loads the list of documents (metadata) from the docs.json file.
 * @returns {Promise<Array>} Array of document metadata objects
 */
async function loadDocs() {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(DOCS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (ex) {
    console.error('Error loading documents:', ex);
    return [];
  }
}

/**
 * Saves the list of documents (metadata) to the docs.json file.
 * @param {Array} docs - Array of document metadata objects
 * @returns {Promise<void>}
 */
async function saveDocs(docs) {
  await ensureDataDirs();
  await fs.writeFile(DOCS_FILE, JSON.stringify(docs, null, 2), 'utf8');
}

/**
 * Returns the file path for a specific document.
 * @param {string} id - Document ID
 * @returns {string} Full path to the document file
 */
function docPath(id) {
  return path.join(DOCS_DIR, `${id}.json`);
}

const app = express();

// Middleware: Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware: Parse JSON bodies (with size limit for large AMFE documents)
app.use(express.json({ limit: '10mb' }));

// API Routes

/**
 * GET /api/docs
 * Retrieves the list of all documents (metadata only).
 */
app.get('/api/docs', async (req, res) => {
  try {
    const docs = await loadDocs();
    res.json(docs);
  } catch (err) {
    console.error('Error in GET /api/docs:', err);
    res.status(500).json({ error: 'Error al cargar documentos' });
  }
});

/**
 * POST /api/docs
 * Creates a new document with initial content.
 */
app.post('/api/docs', async (req, res) => {
  try {
    const docs = await loadDocs();
    
    // Generate unique document ID based on timestamp
    const id = 'doc' + Date.now();
    
    // Create metadata object
    const meta = {
      id,
      name: req.body.name || 'Nuevo AMFE',
      lastModified: new Date().toISOString(),
    };
    
    docs.push(meta);
    await saveDocs(docs);
    
    // Create initial document content structure
    const content = req.body.content || {
      general: {
        orgName: '', tema: '', numeroAmfe: '', revisionAmfe: '', planta: '', 
        fechaInicio: '', responsable: '', cliente: '', fechaRevision: '', 
        confidencialidad: '', modelo: '', equipo: '', planNumber: '', contacto: '', 
        tipoPlan: '', numParte: '', ultimoCambio: '', aprobProv: '', 
        aprobIngCliente: '', aprobCalidadCliente: '', aprobOtras: ''
      },
      items: [],
      selected: { itemId: null, stepId: null, elementId: null }
    };
    
    await fs.writeFile(docPath(id), JSON.stringify(content, null, 2), 'utf8');
    res.json(meta);
  } catch (err) {
    console.error('Error in POST /api/docs:', err);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

/**
 * GET /api/docs/:id
 * Retrieves a specific document's content by ID.
 */
app.get('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  
  // Basic input validation
  if (!id || !id.startsWith('doc')) {
    return res.status(400).json({ error: 'ID de documento inválido' });
  }
  
  try {
    const raw = await fs.readFile(docPath(id), 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Error in GET /api/docs/:id:', err);
    res.status(404).json({ error: 'Documento no encontrado' });
  }
});

/**
 * PUT /api/docs/:id
 * Updates an existing document's metadata and/or content.
 */
app.put('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  
  // Basic input validation
  if (!id || !id.startsWith('doc')) {
    return res.status(400).json({ error: 'ID de documento inválido' });
  }
  
  try {
    const docs = await loadDocs();
    const idx = docs.findIndex(d => d.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    // Update metadata
    if (req.body.name) {
      docs[idx].name = req.body.name;
    }
    docs[idx].lastModified = new Date().toISOString();
    await saveDocs(docs);
    
    // Update content if provided
    if (req.body.content) {
      await fs.writeFile(docPath(id), JSON.stringify(req.body.content, null, 2), 'utf8');
    }
    
    res.json(docs[idx]);
  } catch (err) {
    console.error('Error in PUT /api/docs/:id:', err);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

/**
 * DELETE /api/docs/:id
 * Deletes a document and its associated data file.
 */
app.delete('/api/docs/:id', async (req, res) => {
  const { id } = req.params;
  
  // Basic input validation
  if (!id || !id.startsWith('doc')) {
    return res.status(400).json({ error: 'ID de documento inválido' });
  }
  
  try {
    let docs = await loadDocs();
    const idx = docs.findIndex(d => d.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    // Remove from metadata list
    docs.splice(idx, 1);
    await saveDocs(docs);
    
    // Delete content file
    try {
      await fs.unlink(docPath(id));
    } catch (ex) {
      // File might not exist, that's okay
      console.warn('Content file not found for deletion:', id);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/docs/:id:', err);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

// Server initialization
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor AMFE escuchando en http://localhost:${PORT}`);
  console.log(`Para acceder a la aplicación, visite: http://localhost:${PORT}/home.html`);
});