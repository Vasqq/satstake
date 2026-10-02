import { describe, expect, it } from "vitest";
import { type Route, parseRoute } from "./routes";

const UINT256_MAX = (2n ** 256n - 1n).toString();
const UINT256_OVER = (2n ** 256n).toString();

describe("LLR-FE-013 hash routes", () => {
  it("maps the five documented routes", () => {
    expect(parseRoute("#/")).toEqual<Route>({ name: "home" });
    expect(parseRoute("#/create")).toEqual<Route>({ name: "create" });
    expect(parseRoute("#/mine")).toEqual<Route>({ name: "mine" });
    expect(parseRoute("#/about")).toEqual<Route>({ name: "about" });
    expect(parseRoute("#/p/7")).toEqual<Route>({ name: "pledge", id: 7n });
  });

  it("treats an empty hash as the home route, since the site root has none", () => {
    expect(parseRoute("")).toEqual<Route>({ name: "home" });
    expect(parseRoute("#")).toEqual<Route>({ name: "home" });
  });

  it("reads a pledge id as a whole decimal number, from 0 to 2^256 - 1", () => {
    expect(parseRoute("#/p/0")).toEqual<Route>({ name: "pledge", id: 0n });
    expect(parseRoute("#/p/12")).toEqual<Route>({ name: "pledge", id: 12n });
    expect(parseRoute(`#/p/${UINT256_MAX}`)).toEqual<Route>({ name: "pledge", id: 2n ** 256n - 1n });
    expect(parseRoute(`#/p/${UINT256_OVER}`)).toEqual<Route>({ name: "notFound" });
  });

  it("sends any other route to not found", () => {
    const others = [
      "#/x",
      "#/Create",
      "#/create/",
      "#/mine/1",
      "#/about?x=1",
      "#/about#top",
      "#/p",
      "#/p/",
      "#/p/abc",
      "#/p/-1",
      "#/p/+1",
      "#/p/1.5",
      "#/p/1e3",
      "#/p/0x10",
      "#/p/ 1",
      "#/p/01",
      "#/p/1/2",
      "#/p/1/",
      "#//create",
      "create",
      "/create",
    ];
    for (const hash of others) expect(parseRoute(hash), hash).toEqual<Route>({ name: "notFound" });
  });
});
