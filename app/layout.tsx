import "./globals.css";
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata = {
  title: "Panel de ingresos · Jóvenes creaTIvos",
  description: "Asistencia por sesión y semana",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
