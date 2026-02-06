export type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type RetryableError = Error & { status?: number; retryable?: boolean };

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as RetryableError;
  if (err.retryable) {
    return true;
  }
  if (err.status && (err.status === 429 || err.status >= 500)) {
    return true;
  }
  if ((err as Error).name === "AbortError") {
    return true;
  }
  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= options.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === options.maxRetries) {
        throw error;
      }
      const delay = Math.min(
        options.baseDelayMs * 2 ** attempt,
        options.maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  throw lastError;
}
