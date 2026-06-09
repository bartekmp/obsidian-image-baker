export const LOG_LEVELS = ["off", "error", "warn", "info", "debug"] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

export type LogSink = Pick<Console, "error" | "warn" | "info" | "debug">;

const LEVEL_WEIGHT: Record<LogLevelName, number> = {
	off: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

export function isLogLevelName(value: unknown): value is LogLevelName {
	return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/** Leveled event logger with a pluggable sink (console by default). */
export class Logger {
	private level: LogLevelName;

	constructor(
		private readonly prefix: string,
		level: LogLevelName = "warn",
		private readonly sink: LogSink = console,
	) {
		this.level = level;
	}

	getLevel(): LogLevelName {
		return this.level;
	}

	setLevel(level: LogLevelName): void {
		this.level = level;
	}

	error(message: string, ...details: unknown[]): void {
		this.emit("error", message, details);
	}

	warn(message: string, ...details: unknown[]): void {
		this.emit("warn", message, details);
	}

	info(message: string, ...details: unknown[]): void {
		this.emit("info", message, details);
	}

	debug(message: string, ...details: unknown[]): void {
		this.emit("debug", message, details);
	}

	private emit(
		level: Exclude<LogLevelName, "off">,
		message: string,
		details: unknown[],
	): void {
		if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) {
			return;
		}
		this.sink[level](`[${this.prefix}] ${message}`, ...details);
	}
}
