import { ProxyAgent, type RequestInit, fetch as undiciFetch } from "undici";

export function getProxyAgent() {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  if (httpProxy) {
    return new ProxyAgent(httpProxy);
  }

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    return new ProxyAgent(httpsProxy);
  }

  return undefined;
}

export const fetch = async (url: string, opts: RequestInit) => {
  // Merge timeout signal with any existing signal from opts
  const timeoutSignal = AbortSignal.timeout(5_000);
  const existingSignal = opts.signal;
  const mergedSignal = existingSignal
    ? AbortSignal.any([timeoutSignal, existingSignal])
    : timeoutSignal;

  return await undiciFetch(url, {
    dispatcher: getProxyAgent(),
    ...opts,
    signal: mergedSignal,
  });
};
