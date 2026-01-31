import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

function getAppErrorShape(err: unknown): { statusCode: number; message: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const rec = err as Record<string, unknown>;

  const statusCode = rec.statusCode;
  if (typeof statusCode !== 'number') return null;

  const message = typeof rec.message === 'string' ? rec.message : 'Error';
  return { statusCode, message };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appErrorShape = getAppErrorShape(err);
  const isAppError = err instanceof AppError || appErrorShape !== null;

  const statusCode = isAppError ? (appErrorShape?.statusCode ?? 500) : 500;
  const message =
    isAppError && appErrorShape
      ? appErrorShape.message
      : isAppError && err instanceof Error
        ? err.message
        : 'Internal server error';

  if (statusCode >= 500) {
    logger.error({ err }, 'Unhandled error');
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
    },
  });
};
