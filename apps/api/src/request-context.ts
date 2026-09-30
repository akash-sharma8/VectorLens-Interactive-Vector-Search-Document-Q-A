import { AsyncLocalStorage } from 'node:async_hooks';
import type { VectorDB } from '@vectordb/core';
export const requestContext = new AsyncLocalStorage<{ userId: string; vectors?: VectorDB }>();
export function currentUserId() {
  const id = requestContext.getStore()?.userId;
  if (!id) throw new Error('Authenticated user context is required.');
  return id;
}
