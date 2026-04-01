import pino, { LoggerOptions } from "pino";
import { env } from "../../config/env";

const options: LoggerOptions = {
  level: env.NODE_ENV === "development" ? "debug" : "info",
};

if (env.NODE_ENV === "development") {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  };
}

export const logger = pino(options);
