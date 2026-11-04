export async function responseBody<T>(response: Response): Promise<T> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('服务暂时不可用，请稍后重试。');
  const body = (await response.json()) as { error?: string; issues?: string[]; code?: string };
  if (response.status === 401 && body.code === 'AUTH_REQUIRED')
    window.dispatchEvent(new Event('kotoba:auth-required'));
  if (!response.ok)
    throw new Error([body.error, ...(body.issues ?? [])].filter(Boolean).join('\n'));
  return body as T;
}
