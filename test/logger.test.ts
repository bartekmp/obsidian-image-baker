import { describe, expect, it, vi, type Mock } from "vitest";
import { Logger, LOG_LEVELS, isLogLevelName } from "../src/lib/logger";

type SinkMock = Mock<(...args: unknown[]) => void>;

function makeSink(): Record<"error" | "warn" | "info" | "debug", SinkMock> {
	return {
		error: vi.fn<(...args: unknown[]) => void>(),
		warn: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		debug: vi.fn<(...args: unknown[]) => void>(),
	};
}

describe("isLogLevelName", () => {
	it("accepts every defined level", () => {
		for (const level of LOG_LEVELS) {
			expect(isLogLevelName(level)).toBe(true);
		}
	});

	it("rejects unknown values", () => {
		expect(isLogLevelName("verbose")).toBe(false);
		expect(isLogLevelName(3)).toBe(false);
		expect(isLogLevelName(undefined)).toBe(false);
	});
});

describe("Logger", () => {
	it("prefixes messages and forwards details", () => {
		const sink = makeSink();
		const logger = new Logger("Image Baker", "error", sink);
		const cause = new Error("boom");
		logger.error("it failed", cause);
		expect(sink.error).toHaveBeenCalledWith("[Image Baker] it failed", cause);
	});

	it("suppresses messages above the configured level", () => {
		const sink = makeSink();
		const logger = new Logger("t", "warn", sink);
		logger.error("e");
		logger.warn("w");
		logger.info("i");
		logger.debug("d");
		expect(sink.error).toHaveBeenCalledTimes(1);
		expect(sink.warn).toHaveBeenCalledTimes(1);
		expect(sink.info).not.toHaveBeenCalled();
		expect(sink.debug).not.toHaveBeenCalled();
	});

	it("emits everything at debug level", () => {
		const sink = makeSink();
		const logger = new Logger("t", "debug", sink);
		logger.error("e");
		logger.warn("w");
		logger.info("i");
		logger.debug("d");
		expect(sink.error).toHaveBeenCalledTimes(1);
		expect(sink.warn).toHaveBeenCalledTimes(1);
		expect(sink.info).toHaveBeenCalledTimes(1);
		expect(sink.debug).toHaveBeenCalledTimes(1);
	});

	it("emits nothing when off", () => {
		const sink = makeSink();
		const logger = new Logger("t", "off", sink);
		logger.error("e");
		logger.warn("w");
		logger.info("i");
		logger.debug("d");
		expect(sink.error).not.toHaveBeenCalled();
		expect(sink.warn).not.toHaveBeenCalled();
		expect(sink.info).not.toHaveBeenCalled();
		expect(sink.debug).not.toHaveBeenCalled();
	});

	it("can change level at runtime", () => {
		const sink = makeSink();
		const logger = new Logger("t", "off", sink);
		expect(logger.getLevel()).toBe("off");
		logger.setLevel("info");
		expect(logger.getLevel()).toBe("info");
		logger.info("now visible");
		expect(sink.info).toHaveBeenCalledTimes(1);
	});

	it("defaults to warn with a console sink", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		try {
			const logger = new Logger("t");
			logger.warn("hello");
			expect(spy).toHaveBeenCalledWith("[t] hello");
		} finally {
			spy.mockRestore();
		}
	});
});
