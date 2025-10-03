import type { OctokitOptions } from "@octokit/core";
import { Octokit as Core } from "@octokit/core";
import {
  type PaginateInterface,
  paginateRest,
} from "@octokit/plugin-paginate-rest";
import { legacyRestEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { fetch as customFetch } from "./fetch";

export type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

const DEFAULTS = {
  baseUrl: "https://api.github.com",
  userAgent: "setup-uv",
};

const OctokitWithPlugins = Core.plugin(paginateRest, legacyRestEndpointMethods);

export const Octokit = OctokitWithPlugins.defaults(function buildDefaults(
  options: OctokitOptions,
): OctokitOptions {
  return {
    ...DEFAULTS,
    ...options,
    request: {
      fetch: customFetch,
      ...options.request,
    },
  };
});

export type Octokit = InstanceType<typeof OctokitWithPlugins> & {
  paginate: PaginateInterface;
};
