import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Quiet Insights — Product analytics', description: 'A clear view of how your product is used.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
