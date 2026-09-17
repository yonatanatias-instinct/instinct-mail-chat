import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'צ׳אט עם Instinct', description: 'ממשק הודעות ישיר עם Instinct דרך מייל' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="he" dir="rtl"><body>{children}</body></html>; }
