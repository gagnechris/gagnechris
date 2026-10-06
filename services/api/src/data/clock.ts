/** ISO-8601 "now"; repositories take one so tests and migrations can pin time. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();
