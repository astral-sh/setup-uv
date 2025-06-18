import { fetch as undiciFetch, ProxyAgent, type RequestInit } from "undici";

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

export const fetch = async (url: string, opts: RequestInit) =>
  await undiciFetch(url, {
    dispatcher: getProxyAgent(),
    ...opts,
  });
