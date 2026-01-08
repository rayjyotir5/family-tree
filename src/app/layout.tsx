import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { FamilyTreeProvider } from '@/contexts/FamilyTreeContext';

export const metadata: Metadata = {
  title: 'Family Tree',
  description: 'Personal Family Tree Website',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <FamilyTreeProvider>
            {children}
          </FamilyTreeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
