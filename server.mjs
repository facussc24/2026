import http from 'http';
import handler from 'serve-handler';

const server = http.createServer((request, response) => {
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
