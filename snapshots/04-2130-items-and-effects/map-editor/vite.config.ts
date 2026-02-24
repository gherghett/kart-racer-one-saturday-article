import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

const mapsDir = path.resolve(__dirname, "../maps");

function saveMapPlugin(): Plugin {
  return {
    name: "save-map",
    configureServer(server) {
      // List all maps
      server.middlewares.use("/api/maps", (req, res, next) => {
        // Let /api/maps/<name> fall through to the next handler
        const extra = req.url?.replace(/^\/api\/maps\/?/, "") ?? "";
        if (extra && extra !== "/") {
          next();
          return;
        }

        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          if (!fs.existsSync(mapsDir)) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify([]));
            return;
          }

          const entries = fs.readdirSync(mapsDir, { withFileTypes: true });
          const maps: { name: string; hasJson: boolean }[] = [];

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const jsonPath = path.join(mapsDir, entry.name, "map.json");
            maps.push({
              name: entry.name,
              hasJson: fs.existsSync(jsonPath),
            });
          }

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(maps));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });

      // Load a specific map
      server.middlewares.use("/api/load-map", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        const name = url.searchParams.get("name");
        if (!name) {
          res.statusCode = 400;
          res.end("Missing name parameter");
          return;
        }

        const sanitized = name.replace(/[^a-z0-9_-]/gi, "_");
        const mapDir = path.join(mapsDir, sanitized);

        try {
          const jsonPath = path.join(mapDir, "map.json");
          if (!fs.existsSync(jsonPath)) {
            res.statusCode = 404;
            res.end("Map not found");
            return;
          }

          const mapJson = fs.readFileSync(jsonPath, "utf-8");

          let terrain: string | null = null;
          const terrainPath = path.join(mapDir, "terrain.png");
          if (fs.existsSync(terrainPath)) {
            const buf = fs.readFileSync(terrainPath);
            terrain = "data:image/png;base64," + buf.toString("base64");
          }

          let heightmap: string | null = null;
          const heightPath = path.join(mapDir, "heightmap.png");
          if (fs.existsSync(heightPath)) {
            const buf = fs.readFileSync(heightPath);
            heightmap = "data:image/png;base64," + buf.toString("base64");
          }

          let color: string | null = null;
          const colorPath = path.join(mapDir, "color.png");
          if (fs.existsSync(colorPath)) {
            const buf = fs.readFileSync(colorPath);
            color = "data:image/png;base64," + buf.toString("base64");
          }

          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ mapJson, terrain, heightmap, color }),
          );
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });

      // Save a map
      server.middlewares.use("/api/save-map", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as {
              name: string;
              terrain: string;
              heightmap: string;
              color?: string;
              mapJson: string;
            };

            const outDir = path.resolve(
              mapsDir,
              data.name.replace(/[^a-z0-9_-]/gi, "_"),
            );
            fs.mkdirSync(outDir, { recursive: true });

            const terrainBase64 = data.terrain.replace(
              /^data:image\/png;base64,/,
              "",
            );
            fs.writeFileSync(
              path.join(outDir, "terrain.png"),
              Buffer.from(terrainBase64, "base64"),
            );

            const heightBase64 = data.heightmap.replace(
              /^data:image\/png;base64,/,
              "",
            );
            fs.writeFileSync(
              path.join(outDir, "heightmap.png"),
              Buffer.from(heightBase64, "base64"),
            );

            if (data.color) {
              const colorBase64 = data.color.replace(
                /^data:image\/png;base64,/,
                "",
              );
              fs.writeFileSync(
                path.join(outDir, "color.png"),
                Buffer.from(colorBase64, "base64"),
              );
            }

            fs.writeFileSync(
              path.join(outDir, "map.json"),
              data.mapJson,
              "utf-8",
            );

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, path: outDir }));
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [saveMapPlugin()],
});
