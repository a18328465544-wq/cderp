import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {App} from "@/src/app/App";
import "@/src/index.css";
import {installRuntimeTelemetry} from "@/src/services/observability/clientTelemetry";

installRuntimeTelemetry();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
