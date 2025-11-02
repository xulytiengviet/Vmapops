import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'MapOps - City Analyst',
    description: 'AI-powered conversational city analyst with interactive maps',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link
                    rel="icon"
                    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='50' font-size='50'>🗺️</text></svg>"
                />
            </head>
            <body>
                <main style={{ height: '100vh', overflow: 'hidden' }}>
                    {children}
                </main>
            </body>
        </html>
    );
}
