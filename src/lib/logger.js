/**
 * Lightweight structured logger toggled via localStorage.
 * Usage: const log = createLogger('moduleName');
 *        log.log('message');   // debug-only
 *        log.warn('message');  // always
 *        log.error('message'); // always
 *        log.time('label');    // debug-only
 *        log.timeEnd('label'); // debug-only
 */

function isDebug() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('debug') === '1';
  } catch {
    return false;
  }
}

export function createLogger(module) {
  const prefix = `[${module}]`;

  return {
    log(...args) {
      if (isDebug()) console.log(prefix, ...args);
    },
    warn(...args) {
      console.warn(prefix, ...args);
    },
    error(...args) {
      console.error(prefix, ...args);
    },
    time(label) {
      if (isDebug()) console.time(`${prefix} ${label}`);
    },
    timeEnd(label) {
      if (isDebug()) console.timeEnd(`${prefix} ${label}`);
    }
  };
}
