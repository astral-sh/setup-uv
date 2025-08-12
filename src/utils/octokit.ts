import { Octokit as Core } from "@octokit/core";
import type {
  Constructor,
  OctokitOptions,
} from "@octokit/core/dist-types/types";
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
