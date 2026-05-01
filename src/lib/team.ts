export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function assertNonEmptyString(value: unknown, fieldName: string, maxLength = 120) {
  if (typeof value !== "string") {
    throw new HttpError(`${fieldName} is required.`, 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpError(`${fieldName} is required.`, 400);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(`${fieldName} must be at most ${maxLength} characters.`, 400);
  }

  return trimmed;
}

export function assertDueAt(value: unknown) {
  if (typeof value !== "string") {
    throw new HttpError("dueAt is required.", 400);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError("dueAt must be a valid ISO date.", 400);
  }

  return parsed.toISOString();
}

export function generateJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
