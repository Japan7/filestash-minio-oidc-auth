import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.46/deno-dom-wasm.ts";
import { HTMLDocument } from "https://deno.land/x/deno_dom@v0.1.46/src/dom/document.ts";
import { logger } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";

const FILESTASH_URL = Deno.env.get("FILESTASH_URL")!;
const FILESTASH_API_KEY = Deno.env.get("FILESTASH_API_KEY")!;
const API_PREFIX = Deno.env.get("API_PREFIX")!;

const OIDC_CONFIG_URL = Deno.env.get("OIDC_CONFIG_URL")!;
const OIDC_CLIENT_ID = Deno.env.get("OIDC_CLIENT_ID")!;
const OIDC_CLIENT_SECRET = Deno.env.get("OIDC_CLIENT_SECRET")!;

const MINIO_URL = Deno.env.get("MINIO_URL")!;

const FILESTASH_REDIRECT_URI = `${FILESTASH_URL}${API_PREFIX}/callback`;

const app = new Hono();
const domParser = new DOMParser();

app.use("*", logger());

app.get("/login", (c) => {
  return c.redirect(`${API_PREFIX}/login`, 301);
});

app.get(`${API_PREFIX}/login`, async (c) => {
  const config = await getOIDCConfig();
  const authUrl = new URL(config.authorization_endpoint);
  authUrl.searchParams.set("client_id", OIDC_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", FILESTASH_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid groups");
  return c.redirect(authUrl.toString());
});

app.get(`${API_PREFIX}/callback`, async (c) => {
  const accessToken = await getOIDCAccessToken(c.req.query("code")!);
  const s3WebId = await getMinioCreds(accessToken);
  const setCookie = await createFilestashSession(s3WebId);
  c.res.headers.set("Set-Cookie", setCookie);
  return c.redirect("/");
});

let oidcConfig: {
  authorization_endpoint: string;
  token_endpoint: string;
};
async function getOIDCConfig() {
  if (!oidcConfig) {
    const resp = await fetch(OIDC_CONFIG_URL);
    oidcConfig = await resp.json();
  }
  return oidcConfig;
}

async function getOIDCAccessToken(code: string) {
  const form = new URLSearchParams();
  form.append("client_id", OIDC_CLIENT_ID);
  form.append("client_secret", OIDC_CLIENT_SECRET);
  form.append("grant_type", "authorization_code");
  form.append("code", code);
  form.append("redirect_uri", FILESTASH_REDIRECT_URI);

  const config = await getOIDCConfig();
  const resp = await fetch(config.token_endpoint, {
    method: "POST",
    body: form,
  });
  const json = await resp.json();

  return json.access_token as string;
}

async function getMinioCreds(accessToken: string) {
  const params = new URLSearchParams();
  params.append("Action", "AssumeRoleWithWebIdentity");
  params.append("WebIdentityToken", accessToken);
  params.append("Version", "2011-06-15");
  const resp = await fetch(`${MINIO_URL}/?${params}`, { method: "POST" });
  const text = await resp.text();
  const doc = domParser.parseFromString(text, "text/html")!; // FIXME: use a proper XML parser
  return doc;
}

async function createFilestashSession(s3WebId: HTMLDocument) {
  const params = new URLSearchParams();
  params.append("key", FILESTASH_API_KEY);
  const payload = {
    type: "s3",
    endpoint: MINIO_URL,
    access_key_id: s3WebId.querySelector("AccessKeyId")!.textContent,
    secret_access_key: s3WebId.querySelector("SecretAccessKey")!.textContent,
    session_token: s3WebId.querySelector("SessionToken")!.textContent,
  };
  const resp = await fetch(`${FILESTASH_URL}/api/session?${params}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const setCookie = resp.headers.get("Set-Cookie")!;
  return setCookie;
}

Deno.serve(app.fetch);
