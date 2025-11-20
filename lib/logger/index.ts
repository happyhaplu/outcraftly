 
// Export the server or client implementation based on runtime without dynamic require paths.

export type { LogContext } from './logger.server';

type LoggerModule = {
	getLogger: typeof import('./logger.server').getLogger;
	withLogContext: typeof import('./logger.server').withLogContext;
	logger: typeof import('./logger.server').logger;
};

const isServer = typeof window === 'undefined';

let tsNodeRegistered = false;

const registerTypeScriptLoader = () => {
	if (!isServer || tsNodeRegistered || typeof require !== 'function') {
		return;
	}
	try {
		const tsNode = require('ts-node') as typeof import('ts-node');
		if (typeof tsNode.register === 'function') {
			tsNode.register({
				transpileOnly: true,
				compilerOptions: {
					module: 'commonjs',
					target: 'ES2020',
					esModuleInterop: true
				}
			});
			tsNodeRegistered = true;
		}
	} catch {
		// If ts-node is unavailable, fall back to Node's default resolution.
	}
};

if (isServer) {
	registerTypeScriptLoader();
}

const impl: LoggerModule = isServer
	? (require('./logger.server') as LoggerModule)
	: (require('./logger.client') as LoggerModule);

export const getLogger = impl.getLogger;
export const withLogContext = impl.withLogContext;
export const logger = impl.logger;

export default logger;
