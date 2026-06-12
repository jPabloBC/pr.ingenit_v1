import type { Metadata, Viewport } from "next";
import { Archivo, Open_Sans } from "next/font/google";
import Providers from "../components/providers";
import "./globals.css";

// Configurar fuentes corporativas
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Sansation no está disponible en Google Fonts, usamos Open Sans como alternativa similar
const openSans = Open_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sansation",
  display: "swap",
});

const siteUrl = "https://pr.ingenit.cl";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: "IngenIT - Sistema de Gestión de Personal",
  description:
    "Plataforma integral para la gestión y administración de personal - Minería, PyMES y Grandes Empresas",
  keywords:
    "gestión personal, recursos humanos, asistencia, EPP, nóminas, Chile, minería",
  authors: [{ name: "IngenIT" }],

  openGraph: {
    title: "IngenIT - Sistema de Gestión de Personal",
    description:
      "Plataforma integral para la gestión y administración de personal - Minería, PyMES y Grandes Empresas",
    url: siteUrl,
    siteName: "IngenIT",
    images: [
      {
        url: `${siteUrl}/assets/whatsapp-preview-v4.png`,
        width: 4961,
        height: 2008,
        alt: "IngenIT - Sistema de Gestión de Personal",
      },
    ],
    locale: "es_CL",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "IngenIT - Sistema de Gestión de Personal",
    description:
      "Plataforma integral para la gestión y administración de personal - Minería, PyMES y Grandes Empresas",
    images: [`${siteUrl}/assets/whatsapp-preview-v4.png`],
  },

  icons: {
    icon: "/assets/icon_ingenIT.png",
    shortcut: "/assets/icon_ingenIT.png",
    apple: "/assets/icon_ingenIT.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${archivo.variable} ${openSans.variable}`}>
      <body className={openSans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}