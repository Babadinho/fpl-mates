/**
 * Identity of the software itself, as opposed to the deployment running it.
 *
 * Separate from config.ts so client components can import it without pulling
 * in env parsing. Forks that rename should change all three.
 */
export const APP_NAME = 'fpl-mates';
export const APP_VERSION = '0.1.0';
export const SOURCE_URL = `https://github.com/Babadinho/${APP_NAME}`;
