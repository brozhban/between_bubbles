import type { z } from 'zod'

import type { HttpRequestOptions } from './http-client'

export type AuthenticatedTransport = {
  request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: HttpRequestOptions,
  ): Promise<z.infer<TSchema>>
  /** Для ответов без тела (204): разбирать JSON нечего, но обновление токена всё ещё нужно. */
  requestVoid(path: string, options?: HttpRequestOptions): Promise<void>
  /**
   * Для файлов: выгрузка дневника приходит вложением, а не JSON, и её нужно отдать браузеру
   * как есть. Имя файла берётся из `Content-Disposition` — его назначает сервер.
   */
  requestFile(
    path: string,
    options?: HttpRequestOptions,
  ): Promise<{ blob: Blob; fileName: string | null }>
}
