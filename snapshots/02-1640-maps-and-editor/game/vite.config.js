import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const mapsDir = path.resolve(__dirname, '../maps');

function mapsPlugin() {
  return {
    name: 'serve-maps',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // GET /api/maps — list available maps with metadata
        if (req.url === '/api/maps') {
          let dirs = [];
          try {
            dirs = fs.readdirSync(mapsDir, { withFileTypes: true })
              .filter(d => d.isDirectory())
              .map(d => d.name);
          } catch { /* maps dir missing */ }

          const maps = dirs.map(name => {
            try {
              const json = JSON.parse(fs.readFileSync(path.join(mapsDir, name, 'map.json'), 'utf-8'));
              return { id: name, ...json };
            } catch {
              return { id: name, name };
            }
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(maps));
          return;
        }

        // GET /maps/* — serve map files (json, png)
        if (req.url.startsWith('/maps/')) {
          const relPath = decodeURIComponent(req.url.slice(6));
          const filePath = path.join(mapsDir, relPath);
          // Basic path traversal guard
          if (!filePath.startsWith(mapsDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const types = { '.json': 'application/json', '.png': 'image/png' };
            res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
      ],
    },
  },
  resolve: {
    alias: {
      '@sprites': path.resolve(__dirname, '../kart-sprites'),
    },
  },
  plugins: [mapsPlugin()],
});
