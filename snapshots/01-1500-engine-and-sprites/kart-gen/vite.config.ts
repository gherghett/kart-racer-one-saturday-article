import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

function saveSpritesPlugin(): Plugin {
  return {
    name: "save-sprites",
    configureServer(server) {
      server.middlewares.use("/api/save-sprites", (req, res) => {
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
              png: string;
              json: string;
              md: string;
            };
            const outDir = path.resolve(__dirname, "../kart-sprites");
            fs.mkdirSync(outDir, { recursive: true });

            // Write PNG (base64 data URL → buffer)
            const base64 = data.png.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(
              path.join(outDir, "sprites.png"),
              Buffer.from(base64, "base64"),
            );

            // Write JSON
            fs.writeFileSync(
              path.join(outDir, "sprites.json"),
              data.json,
              "utf-8",
            );

            // Write README
            fs.writeFileSync(
              path.join(outDir, "README.md"),
              data.md,
              "utf-8",
            );

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
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
  plugins: [saveSpritesPlugin()],
});
