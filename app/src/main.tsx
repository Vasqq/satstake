import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createAppConfig } from "./chain/wagmi";
import { network } from "./config";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("index.html has no #root element");

createRoot(container).render(
  <StrictMode>
    <App network={network} config={createAppConfig(network)} />
  </StrictMode>,
);
