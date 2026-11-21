import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerOptionalServiceWorker,
  shouldEnableServiceWorker,
} from "../lib/service-worker";
import { requestOrigin } from "../lib/request-origin";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
test("redirect de login conserva el origen del proxy y rechaza host inválido", () => {
  const response = middleware(
    new NextRequest("http://internal:3200/admin", {
      headers: {
        "x-forwarded-host": "eira.example",
        "x-forwarded-proto": "https",
      },
    }),
  );
  assert.equal(response.headers.get("location"), "https://eira.example/login");
  assert.equal(
    middleware(
      new NextRequest("http://internal/admin", {
        headers: { "x-forwarded-host": "invalid/path" },
      }),
    ).status,
    400,
  );
  assert.equal(
    middleware(
      new NextRequest("http://internal/admin", {
        headers: { cookie: "eira_session=example" },
      }),
    ).headers.get("x-middleware-next"),
    "1",
  );
});
test("SW solo localhost o activación explícita; sin contenedor o registro rechazado no falla", async () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"])
    assert.equal(shouldEnableServiceWorker(hostname), true);
  assert.equal(shouldEnableServiceWorker("eira.example"), false);
  assert.equal(shouldEnableServiceWorker("eira.example", "true"), false);
  assert.equal(shouldEnableServiceWorker("eira.example", "1"), true);
  let calls = 0;
  await registerOptionalServiceWorker("eira.example", undefined, () => {
    calls++;
    throw Error("No debe acceder");
  });
  assert.equal(calls, 0);
  await registerOptionalServiceWorker("localhost", undefined, () => undefined);
  await registerOptionalServiceWorker("localhost", undefined, () => {
    throw Error("API bloqueada");
  });
  await registerOptionalServiceWorker("localhost", undefined, () => ({
    register() {
      throw Error("403");
    },
  }));
  await registerOptionalServiceWorker("localhost", undefined, () => ({
    register: () => Promise.reject(Error("403")),
  }));
  await registerOptionalServiceWorker("eira.example", "1", () => ({
    register: async (path) => {
      assert.equal(path, "/sw.js");
      calls++;
      return {} as ServiceWorkerRegistration;
    },
  }));
  assert.equal(calls, 1);
});
test("origen público desde forwarded, Host o URL; rechaza encabezados inválidos", () => {
  assert.equal(
    requestOrigin(
      new Request("http://internal:3200/api/pap", {
        headers: {
          host: "internal:3200",
          "x-forwarded-host": "eira.example, proxy.internal",
          "x-forwarded-proto": "https, http",
        },
      }),
    ),
    "https://eira.example",
  );
  assert.equal(
    requestOrigin(
      new Request("https://internal/api/pap", {
        headers: { host: "eira.example:8443" },
      }),
    ),
    "https://eira.example:8443",
  );
  assert.equal(
    requestOrigin(new Request("https://eira.example/api/pap")),
    "https://eira.example",
  );
  assert.throws(() =>
    requestOrigin(
      new Request("http://internal/api/pap", {
        headers: { "x-forwarded-host": "evil.example/path" },
      }),
    ),
  );
  assert.throws(() =>
    requestOrigin(
      new Request("http://internal/api/pap", {
        headers: { "x-forwarded-host": "user@evil.example" },
      }),
    ),
  );
  assert.throws(() =>
    requestOrigin(
      new Request("http://internal/api/pap", {
        headers: { "x-forwarded-proto": "javascript" },
      }),
    ),
  );
});
