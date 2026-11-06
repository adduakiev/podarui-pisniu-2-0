import { createInstagramWebhook } from './instagram-direct';

export async function handleInstagramRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (env.INSTAGRAM_DIRECT_ENABLED !== '1') {
    return new Response(null, { status: 404 });
  }
  const accountId = env.INSTAGRAM_DIRECT_ACCOUNT_ID;
  const version = env.INSTAGRAM_DIRECT_API_VERSION;
  const accessToken = env.INSTAGRAM_DIRECT_ACCESS_TOKEN;
  const appSecret = env.INSTAGRAM_DIRECT_APP_SECRET;
  const verifyToken = env.INSTAGRAM_DIRECT_VERIFY_TOKEN;
  if (env.LOCAL_ONLY !== '1' || env.VERCEL || !env.DATA_DIR || !env.SESSION_SECRET
    || !accountId || !/^\d+$/.test(accountId)
    || !version || !/^v\d+\.\d+$/.test(version)
    || !accessToken || !appSecret || !verifyToken) {
    return new Response(null, { status: 503 });
  }

  const endpoint = 'https://graph.instagram.com/' + version + '/' + accountId + '/messages';
  return createInstagramWebhook({
    appSecret,
    verifyToken,
    accountIds: new Set([accountId]),
    send: async ({ senderId, text }) => {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: senderId }, message: { text } }),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw Error('Instagram delivery failed');
      const result = await response.json();
      if (typeof result?.message_id !== 'string' || !result.message_id) {
        throw Error('Instagram did not confirm delivery');
      }
    },
  })(request);
}
