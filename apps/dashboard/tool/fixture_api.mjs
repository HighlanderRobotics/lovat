import http from 'node:http';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
let picklist = fixtures.picklist;
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Access-Control-Expose-Headers', 'ETag');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  if (url.pathname === '/healthz') { response.end('{}'); return; }
  if (request.headers.authorization !== 'Bearer synthetic-dashboard') { response.writeHead(401).end('{}'); return; }
  let result;
  if (url.pathname === '/v1/manager/tournaments') result = fixtures.tournaments;
  else if (url.pathname.endsWith('/rankedTeams')) result = fixtures.rankedTeams;
  else if (url.pathname.startsWith('/v1/analysis/flag/team/')) result = fixtures.flags;
  else if (url.pathname === '/v1/analysis/picklist') result = fixtures.analysis;
  else if (url.pathname === '/v1/manager/mutablepicklists/synthetic-picklist') {
    if (request.method === 'PUT') {
      let body = ''; for await (const chunk of request) body += chunk;
      const update = JSON.parse(body);
      if (JSON.stringify([...update.teams].sort()) !== '[1234,5678]') { response.writeHead(400).end('{}'); return; }
      picklist = { ...picklist, ...update };
    }
    result = picklist;
  } else { response.writeHead(404).end(JSON.stringify({ error: 'Unknown synthetic fixture path', path: url.pathname })); return; }
  const body = JSON.stringify(result);
  const etag = `"${Buffer.from(body).toString('base64')}"`;
  response.setHeader('ETag', etag);
  if (request.headers['if-none-match'] === etag) response.writeHead(304).end();
  else response.end(body);
});
server.listen(9878, '127.0.0.1', () => console.log('Synthetic Dashboard fixture ready on 9878'));
