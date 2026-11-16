import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useBoard } from "./store";
import { dropSocketForTests } from "./realtime/connection";

// Test hooks. They exist only in development (`npm run dev`), never in the production build.
if (import.meta.env.DEV) Object.assign(window, { __board: useBoard, __dropSocket: dropSocketForTests });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
