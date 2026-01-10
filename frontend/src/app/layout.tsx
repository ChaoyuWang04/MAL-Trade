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
  return (
    <html lang="en">
      <body>
        <ExtensionErrorSilencer />
        {children}
      </body>
    </html>
  );
}
