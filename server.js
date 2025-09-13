import http from 'http';
import handler from 'serve-handler';

const server = http.createServer((req, res) => {
  return handler(req, res, {
    public: 'public' // Serve the 'public' directory
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
