import http from 'http';
import handler from 'serve-handler';
import fs from 'fs/promises';
import path from 'path';

const server = http.createServer(async (request, response) => {
  // Custom API endpoint for listing 3D models
  if (request.url === '/api/models') {
    const modelsPath = path.join(process.cwd(), 'public', 'modulos', 'visor3d', 'modelos');
    try {
      const entries = await fs.readdir(modelsPath, { withFileTypes: true });
      const directories = entries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
          // Create a more human-readable name from the ID
          const name = dirent.name
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          return { id: dirent.name, name: name };
        });

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(directories));
    } catch (error) {
      console.error("Error reading models directory:", error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
    return; // End execution for this request
  }

  // Fallback to the static file handler for all other requests
  return handler(request, response, {
    "public": "public",
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source" : "**",
        "headers" : [{
          "key" : "Access-Control-Allow-Origin",
          "value" : "*"
        }]
      }
    ]
  });
});

server.listen(8080, () => {
  console.log('Running at http://localhost:8080');
});
