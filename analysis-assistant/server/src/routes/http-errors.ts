import type { Response } from 'express';
import type { ZodError } from 'zod';
import type { ErrorBody } from '../../../shared/api-contract';

export function sendInvalidRequest(res: Response, error: ZodError): void {
  const body: ErrorBody = {
    code: 'invalid_request',
    message: error.issues.map((issue) => issue.message).join(' '),
  };
  res.status(400).json(body);
}
