import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development, `npm run dev` serves the website AND the API on the same port.
// (In production, Vercel runs api/v1.ts instead.) Data is kept in .data/db.json.
function devApi(): Plugin {
  return {
    name: "sketchboard-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/v1", async (req, res, next) => {
        try {
          const { createNodeHandler } = await server.ssrLoadModule("/api/_lib/node-adapter.ts");
          req.url = "/api/v1" + (req.url ?? "");
          await createNodeHandler()(req, res);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
});
