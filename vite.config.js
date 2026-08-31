import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `vite dev` serves the SPA but knows nothing about the /api directory, which Vercel
// runs as serverless functions. Without this the change-password and Team screens fail
// against a 404. apply: "serve" keeps it out of every production build.
function apiRoutes() {
  return {
    name: "api-routes-dev",
    apply: "serve",
    configureServer(server) {
      // The Admin SDK reads these from the process, and Vite does not put .env into
      // process.env the way it does VITE_* into import.meta.env.
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "GCLOUD_PROJECT"]) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const route = req.url.split("?")[0].slice("/api/".length);

        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (body) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
          return res;
        };

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString("utf8");
          req.body = raw ? JSON.parse(raw) : {};

          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(`/api/${route} failed: ${err?.stack ?? err}`);
          if (!res.writableEnded) res.status(500).json({ error: "Something went wrong. Try again." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiRoutes()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}"],
    exclude: ["tests/rules/**"],
  },
});
