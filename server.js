import http from 'http';
import handler from 'serve-handler';

const server = http.createServer((request, response) => {
  return handler(request, response, {
    "public": "public",
    "single": true
  });
});

server.listen(3000, () => {
  console.log('Running at http://localhost:3000');
});
