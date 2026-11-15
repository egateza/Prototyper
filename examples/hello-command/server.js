import http from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

http
  .createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<h1>Hello dari prototype command</h1><p>Berjalan di port ${port}.</p>`);
  })
  .listen(port, host, () => console.log(`Listening on http://${host}:${port}`));
