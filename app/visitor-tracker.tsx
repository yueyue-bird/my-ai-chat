'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_ID_KEY = 'usage_visitor_id';

function createVisitorId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `visitor-${crypto.randomUUID()}`;
  }

  return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;

  const visitorId = createVisitorId();
  window.localStorage.setItem(VISITOR_ID_KEY, visitorId);
  return visitorId;
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef('');

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname.startsWith('/api')) return;
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    fetch('/api/visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-visitor-id': getVisitorId(),
      },
      body: JSON.stringify({ pathname }),
      cache: 'no-store',
      keepalive: true,
    })
      .catch(() => {
        if (lastTrackedPath.current === pathname) lastTrackedPath.current = '';
      });
  }, [pathname]);

  return null;
}
