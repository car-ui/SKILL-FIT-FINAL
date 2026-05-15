import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// Point all API calls to the backend server.
// In Replit dev: VITE_API_BASE_URL is empty → Vite proxy handles /api/* forwarding.
// In standalone dev or production: set VITE_API_BASE_URL to the backend origin.
const apiBase = (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ?? "";
if (apiBase && apiBase !== "/") {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById("root")!).render(<App />);