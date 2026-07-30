import './globals.css';
import VisitorTracker from './visitor-tracker';

export const metadata = {
  title: 'Taste to Music Lab',
  description: '让味觉轨迹成为一段独特的音乐。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <VisitorTracker />
        {children}
      </body>
    </html>
  );
}
