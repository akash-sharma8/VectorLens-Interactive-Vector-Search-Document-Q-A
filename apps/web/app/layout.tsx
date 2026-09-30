import type { Metadata } from 'next';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';
import './globals.css';
import { ThemeProvider } from '../components/ThemeProvider';
export const metadata:Metadata={title:'VectorDB — HNSW + RAG',description:'Explore custom vector search algorithms and ask questions about your documents.'};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
