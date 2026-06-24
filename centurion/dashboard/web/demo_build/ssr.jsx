import React from "react";
import { renderToString } from "react-dom/server";
import App from "./app.jsx";
process.stdout.write(renderToString(<App />));
