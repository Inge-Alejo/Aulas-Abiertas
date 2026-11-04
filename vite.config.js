import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Cargar variables en process.env para que los endpoints de API las encuentren localmente
  Object.assign(process.env, env);

  return {
    server: {
      port: 5173
    },
    plugins: [
      {
        name: 'local-api-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/')) {
              try {
                const parsedUrl = new URL(req.url, 'http://localhost:5173');
                const routeName = parsedUrl.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
                const filePath = path.resolve(process.cwd(), 'api', `${routeName}.js`);

                if (!fs.existsSync(filePath)) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `Ruta API no encontrada: /api/${routeName}` }));
                  return;
                }

                let rawBody = '';
                req.on('data', chunk => { rawBody += chunk; });
                req.on('end', async () => {
                  try {
                    req.body = rawBody ? JSON.parse(rawBody) : {};
                  } catch {
                    req.body = rawBody || {};
                  }

                  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

                  // Mock de métodos Vercel/Express para req y res
                  res.status = (code) => {
                    res.statusCode = code;
                    return res;
                  };
                  res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                  };

                  try {
                    const mod = await import(`${filePath}?t=${Date.now()}`);
                    await mod.default(req, res);
                  } catch (err) {
                    console.error(`[Local API Error /api/${routeName}]:`, err);
                    if (!res.writableEnded) {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: err.message }));
                    }
                  }
                });
                return;
              } catch (err) {
                console.error('[Middleware Error]:', err);
                next();
              }
            } else {
              next();
            }
          });
        }
      }
    ]
  };
});
