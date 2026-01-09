import "@/app/globals.css";

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
      <body>{children}</body>
    </html>
  );
}
