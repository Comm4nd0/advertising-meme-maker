import pino from 'pino';

// Structured logger for the whole server. Pretty-printed because this app is
// run from a terminal on a LAN box, not shipped to a log aggregator.
// DEBUG=1 surfaces debug-level lines (same flag as util/debug.ts).
export const log = pino({
  level: process.env.DEBUG ? 'debug' : 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});
