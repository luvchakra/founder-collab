import test from "node:test";
import assert from "node:assert/strict";
import { appRoutes, findBrokenHelpLinks } from "./check-help-links.mjs";

const guide = (slug, ids, body) => ({ slug, sections: ids.map((id, i) => ({ id, heading: id, body: i === 0 ? body : "" })) });

test("every link in the real help guides resolves", () => {
  assert.deepEqual(findBrokenHelpLinks(), []);
});

test("reads the app's routes, dropping route groups", () => {
  const routes = appRoutes().map((r) => `/${r.join("/")}`);
  assert.ok(routes.includes("/pricing"), "the (site) group's /pricing page");
  assert.ok(routes.includes("/help/[slug]"));
});

test("reports a missing guide, section, app page or a markdown-file link", () => {
  const guides = [
    guide("a", ["one", "two"], [
      "[ok](/help/b#three) [ok](#two) [ok](/pricing) [ok](https://example.com) [ok](mailto:x@y.z) [ok](/acme/crm)",
      "[bad](/help/zzz) [bad](/help/b#nope) [bad](#nope) [bad](/no-such-page/x) [bad](./02-b.md#three)",
    ].join(" ")),
    guide("b", ["three"], ""),
  ];
  const routes = [["pricing"], ["[businessSlug]", "crm"], ["help"], ["help", "[slug]"]];
  const problems = findBrokenHelpLinks(guides, routes);
  assert.equal(problems.length, 5, problems.join("\n"));
  assert.match(problems.join("\n"), /zzz -- no such guide/);
  assert.match(problems.join("\n"), /b#nope -- no such section/);
  assert.match(problems.join("\n"), /#nope -- no such section in this guide/);
  assert.match(problems.join("\n"), /no-such-page\/x -- no such page in the app/);
  assert.match(problems.join("\n"), /02-b\.md#three -- links a markdown file/);
});
