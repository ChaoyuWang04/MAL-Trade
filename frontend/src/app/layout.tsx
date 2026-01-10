import "@/app/globals.css";
import { ExtensionErrorSilencer } from "@/components/ExtensionErrorSilencer";

export const metadata = {
  title: "MAL Trade Arena",
  description: "LLM Crypto Trading Arena"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const silenceExtensionScript = `
    (function() {
      const SHOULD_SILENCE = function(message, source) {
        const msg = message || "";
        const src = source || "";
        return msg.includes("Talisman extension") || src.includes("chrome-extension://fijngjgcjhjmmpcmkeiomlglpeiijkld");
      };
      window.addEventListener("error", function(e) {
        if (SHOULD_SILENCE(e.message, e.filename)) {
          e.preventDefault();
          return true;
        }
      });
      window.addEventListener("unhandledrejection", function(e) {
        const reason = typeof e.reason === "string" ? e.reason : (e.reason && e.reason.message) || "";
        if (SHOULD_SILENCE(reason, "")) {
          e.preventDefault();
          return true;
        }
      });
    })();
  `;
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: silenceExtensionScript }} />
        <ExtensionErrorSilencer />
        {children}
      </body>
    </html>
  );
}
