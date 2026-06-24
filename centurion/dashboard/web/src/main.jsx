import React from "react";
import { createRoot } from "react-dom/client";
import CenturionDashboard from "./CenturionDashboard.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CenturionDashboard />
  </React.StrictMode>
);
