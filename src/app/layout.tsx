import type { Metadata } from "next";
import { Archivo } from 'next/font/google';
import { Open_Sans } from 'next/font/google'; // Usando Open Sans como alternativa a Sansation que no está disponible
import Providers from "@/components/providers";
import "./globals.css";

// Configurar fuentes corporativas
const archivo = Archivo({ 
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

// Sansation no está disponible en Google Fonts, usamos Open Sans como alternativa similar
const openSans = Open_Sans({ 
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sansation',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "IngenIT - Sistema de Gestión de Personal",
  description: "Plataforma integral para la gestión y administración de personal - Minería, PyMES y Grandes Empresas",
  keywords: "gestión personal, recursos humanos, asistencia, EPP, nóminas, Chile, minería",
  authors: [{ name: "IngenIT" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${archivo.variable} ${openSans.variable}`}>
      <body className={openSans.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
