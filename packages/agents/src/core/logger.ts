import { pino, type Logger, type LoggerOptions } from "pino";

const isTty = process.stdout.isTTY;

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "sentinel" },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const transport = isTty
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    }
  : undefined;

export const rootLogger: Logger = transport
  ? pino({ ...baseOptions, transport })
  : pino(baseOptions);

export function childLogger(component: string, extra: Record<string, unknown> = {}): Logger {
  return rootLogger.child({ component, ...extra });
}
