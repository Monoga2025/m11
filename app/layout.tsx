import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PhysicsInk',
  description: 'Plataforma educativa de ingeniería dinámica — Beer & Johnston',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-950 text-white antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
