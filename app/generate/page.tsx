// app/generate/page.tsx
import { Suspense } from 'react';
import GenerateContent from './GenerateContent';

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 text-center">加载中...</div>}>
      <GenerateContent />
    </Suspense>
  );
}