import "./globals.css";
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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
