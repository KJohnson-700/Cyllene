import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { RunStreamProvider } from "@/hooks/useRunStream";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RunStreamProvider>
      <App />
    </RunStreamProvider>
  </StrictMode>
);
