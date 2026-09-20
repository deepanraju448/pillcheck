const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const port = 4173;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function handleLogin(request, response) {
  const body = JSON.parse(await readRequestBody(request));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJson(response, 400, { error: 'Enter a valid email address.' });
    return;
  }
  if (!password) {
    sendJson(response, 401, { error: 'Incorrect email or password.' });
    return;
  }
  const configuredPassword = process.env.AUTH_PASSWORD;
  if (configuredPassword) {
    const provided = Buffer.from(password);
    const configured = Buffer.from(configuredPassword);
    if (provided.length !== configured.length || !crypto.timingSafeEqual(provided, configured)) {
      sendJson(response, 401, { error: 'Incorrect email or password.' });
      return;
    }
  }
  const issuedAt = Date.now().toString();
  const payload = `${email}.${issuedAt}`;
  const signature = crypto.createHmac('sha256', process.env.AUTH_SECRET || 'local-development-secret').update(payload).digest('hex');
  const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `pillcheck_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
  });
  response.end(JSON.stringify({ ok: true, email }));
}

http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/auth/login') {
    try {
      await handleLogin(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Unable to sign in.' });
    }
    return;
  }
  const requestedPath = request.url === '/' ? 'index.html' : request.url.slice(1);
  const filePath = path.resolve(root, requestedPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
  });
  response.end(fs.readFileSync(filePath));
}).listen(port, '127.0.0.1', () => {
  console.log(`PillCheck website running at http://127.0.0.1:${port}`);
});
