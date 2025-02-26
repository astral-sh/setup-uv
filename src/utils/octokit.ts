import { Octokit as Core } from "@octokit/core";
import type {
  Constructor,
  OctokitOptions,
} from "@octokit/core/dist-types/types";
import {
  paginateRest,
  type PaginateInterface,
} from "@octokit/plugin-paginate-rest";
import { legacyRestEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { fetch as undiciFetch, ProxyAgent, type RequestInit } from "undici";

export type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

const DEFAULTS = {
  baseUrl: getApiBaseUrl(),
  userAgent: "setup-uv",
};

export function getProxyAgent() {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_prox;
  if (httpProxy) {
    return new ProxyAgent(httpProxy);
  }

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    return new ProxyAgent(httpsProxy);
  }

  return undefined;
}

export const customFetch = async (url: string, opts: RequestInit) =>
  await undiciFetch(url, {
    dispatcher: getProxyAgent(),
    ...opts,
  });

export const Octokit: typeof Core &
  Constructor<
    {
      paginate: PaginateInterface;
    } & ReturnType<typeof legacyRestEndpointMethods>
  > = Core.plugin(paginateRest, legacyRestEndpointMethods).defaults(
  function buildDefaults(options: OctokitOptions): OctokitOptions {
    return {
      ...DEFAULTS,
      ...options,
      request: {
        fetch: customFetch,
        ...options.request,
      },
    };
  },
);

export type Octokit = InstanceType<typeof Octokit>;

function getApiBaseUrl(): string {
  return process.env.GITHUB_API_URL || "https://api.github.com";
}
