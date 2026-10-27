import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Cargar variables en process.env para que el endpoint de API las encuentre localmente
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
            if (req.url === '/api/scrape-mailerlite' && req.method === 'POST') {
              try {
                let rawBody = '';
                req.on('data', chunk => { rawBody += chunk; });
                req.on('end', async () => {
                  try {
                    req.body = rawBody ? JSON.parse(rawBody) : {};
                  } catch {
                    req.body = {};
                  }

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

                  const handler = (await import('./api/scrape-mailerlite.js')).default;
                  await handler(req, res);
                });
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }
            next();
          });
        }
      }
    ]
  };
});
