"use client";

import { useEffect } from "react";

const TALISMAN_EXT_ID = "fijngjgcjhjmmpcmkeiomlglpeiijkld";

export function ExtensionErrorSilencer() {
  useEffect(() => {
    const shouldSilence = (msg?: string, filename?: string) => {
      const message = msg || "";
      const file = filename || "";
      return (
        message.includes("Talisman") ||
        message.includes("扩展程序尚未 配置") ||
        file.includes(`chrome-extension://${TALISMAN_EXT_ID}`)
      );
    };

    const handleError = (event: ErrorEvent) => {
      if (shouldSilence(event.message, event.filename)) {
        event.preventDefault();
        return;
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = typeof event.reason === "string" ? event.reason : event.reason?.message;
      if (shouldSilence(reason, "")) {
        event.preventDefault();
        return;
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
