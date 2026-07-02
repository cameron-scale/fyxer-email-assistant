import React from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import App from "./app.jsx";
const el = document.getElementById("root");
// If the server-rendered markup is present, hydrate it; otherwise render fresh.
if (el && el.firstElementChild) {
  try { hydrateRoot(el, <App />); }
  catch (e) { createRoot(el).render(<App />); }
} else {
  createRoot(el).render(<App />);
}
