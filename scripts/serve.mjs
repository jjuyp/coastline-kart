import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist'),
  port = Number(process.env.PORT || 4173);
http
  .createServer((req, res) => {
    try {
      let p = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(p) || !path.extname(p)) p = path.join(root, 'index.html');
      res.setHeader(
        'Content-Type',
        p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      );
      res.end(readFileSync(p));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
