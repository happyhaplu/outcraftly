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
      console.error('[instrumentation] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[instrumentation] Unhandled Rejection at:', promise);
      console.error('[instrumentation] Reason:', reason);
      if (reason instanceof Error) {
        console.error('[instrumentation] Rejection stack:', reason.stack);
        console.error('[instrumentation] Rejection details:', JSON.stringify(reason, Object.getOwnPropertyNames(reason)));
      }
    });

    // Override console.error to capture ALL error details
    const originalError = console.error;
    console.error = function (...args: any[]) {
      // Log everything
      originalError.apply(console, ['[FULL ERROR CAPTURE]', ...args]);
      
      // Try to extract more details
      args.forEach((arg, index) => {
        if (arg && typeof arg === 'object') {
          try {
            originalError.apply(console, [`[ARG ${index} JSON]`, JSON.stringify(arg, Object.getOwnPropertyNames(arg), 2)]);
          } catch (_e) {
            originalError.apply(console, [`[ARG ${index} STRING]`, String(arg)]);
          }
          
          if (arg instanceof Error) {
            originalError.apply(console, [`[ARG ${index} ERROR STACK]`, arg.stack]);
            originalError.apply(console, [`[ARG ${index} ERROR MESSAGE]`, arg.message]);
            originalError.apply(console, [`[ARG ${index} ERROR NAME]`, arg.name]);
          }
        }
      });
    };

    console.log('[instrumentation] Error handlers registered');
  }
}
