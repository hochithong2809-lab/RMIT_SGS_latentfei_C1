import { Providers } from "./providers";
import './globals.css';
export const metadata = { title: 'TeamVault — Where projects move forward', description: 'A protected workspace for project submissions and reviews.' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
