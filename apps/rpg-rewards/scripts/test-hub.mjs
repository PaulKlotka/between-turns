import http from 'node:http';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../tests/browser/hub.html', import.meta.url));
http.createServer((_req,res) => {res.writeHead(200,{'Content-Type':'text/html'});res.end(html)}).listen(5180,'127.0.0.1');
