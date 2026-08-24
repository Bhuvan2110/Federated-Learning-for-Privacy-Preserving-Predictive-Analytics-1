import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { loadCustomDatasets } from "./lib/datasets";

// Hydrate uploaded (custom) datasets from localStorage before first render
// so the engine, lab, and prediction console can resolve them by id.
loadCustomDatasets();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
