'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from '@/lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const logger = getLogger({ component: 'GlobalErrorBoundary' });
    logger.error({ err: error, info }, 'Unhandled client error captured by error boundary');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong.</h1>
          <p className="text-muted-foreground">Our team has been notified. Please refresh the page or return later.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
