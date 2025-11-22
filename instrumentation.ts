import { assertProductionSecrets } from '@/lib/startup/validate-env';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate production secrets once at startup
    try {
      assertProductionSecrets();
      console.log('[instrumentation] Production secrets validated');
    } catch (error) {
      console.error('[instrumentation] Secret validation failed:', error);
      throw error;
    }

    // Capture all unhandled errors
    process.on('uncaughtException', (error) => {
      console.error('[instrumentation] Uncaught Exception:', error);
      console.error('[instrumentation] Stack:', error.stack);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[instrumentation] Unhandled Rejection at:', promise);
      console.error('[instrumentation] Reason:', reason);
    });

    // Override console.error to capture more details
    const originalError = console.error;
    console.error = function (...args: any[]) {
      if (args.length > 0 && args[0] === ' ⨯') {
        originalError.apply(console, ['[CAPTURED ERROR]', ...args]);
        if (args[1] && typeof args[1] === 'object') {
          originalError.apply(console, ['[ERROR DETAILS]', JSON.stringify(args[1], null, 2)]);
        }
      } else {
        originalError.apply(console, args);
      }
    };

    console.log('[instrumentation] Error handlers registered');
  }
}
