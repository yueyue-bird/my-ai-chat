// app/generate/favorites/page.tsx
'use client';

import { Suspense } from 'react';
import FavoritesContent from './FavoritesContent';

export default function FavoritesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 py-8 px-4 text-white text-center">加载中...</div>}>
      <FavoritesContent />
    </Suspense>
  );
}