'use client';

import React from 'react';
import { SWRConfig } from 'swr';
import { Toaster } from '@/components/ui/toaster';
import { GlobalErrorBoundary } from '@/components/error-boundary';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fallback: {} }}>
      <GlobalErrorBoundary>
        {children}
      </GlobalErrorBoundary>
      <Toaster />
    </SWRConfig>
  );
}
