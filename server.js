import http from 'http';
import handler from 'serve-handler';

const server = http.createServer(async (request, response) => {
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

server.listen(3000, () => {
  console.log('Running at http://localhost:3000');
});
