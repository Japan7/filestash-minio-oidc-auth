import "https://deno.land/std@0.205.0/dotenv/load.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.42/deno-dom-wasm.ts";
import { HTMLDocument } from "https://deno.land/x/deno_dom@v0.1.42/src/dom/document.ts";
import { Hono } from "https://deno.land/x/hono@v3.9.1/mod.ts";

const FILESTASH_URL = Deno.env.get("FILESTASH_URL")!;
const FILESTASH_API_KEY = Deno.env.get("FILESTASH_API_KEY")!;
const API_PREFIX = Deno.env.get("API_PREFIX")!;

const KEYCLOAK_URL = Deno.env.get("KEYCLOAK_URL")!;
const KEYCLOAK_REALM = Deno.env.get("KEYCLOAK_REALM")!;

const MINIO_URL = Deno.env.get("MINIO_URL")!;
const MINIO_KEYCLOAK_CLIENT_ID = Deno.env.get("MINIO_KEYCLOAK_CLIENT_ID")!;
const MINIO_KEYCLOAK_CLIENT_SECRET = Deno.env.get(
  "MINIO_KEYCLOAK_CLIENT_SECRET"
)!;

const BASE_OIDC_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect`;
const FILESTASH_REDIRECT_URI = `${FILESTASH_URL}${API_PREFIX}/callback`;

const app = new Hono();
const domParser = new DOMParser();

app.get("/login", (c) => {
  return c.redirect(`${API_PREFIX}/login`, 301);
});

app.get(`${API_PREFIX}/login`, (c) => {
  return c.redirect(
    `${BASE_OIDC_URL}/auth?client_id=${MINIO_KEYCLOAK_CLIENT_ID}&redirect_uri=${FILESTASH_REDIRECT_URI}&response_type=code&scope=openid`
  );
});

async function getOIDCAccessToken(code: string): Promise<string> {
  const form = new URLSearchParams();
  form.append("client_id", MINIO_KEYCLOAK_CLIENT_ID);
  form.append("client_secret", MINIO_KEYCLOAK_CLIENT_SECRET);
  form.append("grant_type", "authorization_code");
  form.append("code", code);
  form.append("redirect_uri", FILESTASH_REDIRECT_URI);
  const resp = await fetch(`${BASE_OIDC_URL}/token`, {
    method: "POST",
    body: form,
  });
  const json = await resp.json();
  const accessToken = json.access_token;
  return accessToken;
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

app.get(`${API_PREFIX}/callback`, async (c) => {
  const accessToken = await getOIDCAccessToken(c.req.query("code")!);
  const s3WebId = await getMinioCreds(accessToken);
  const setCookie = await createFilestashSession(s3WebId);
  c.res.headers.set("Set-Cookie", setCookie);
  return c.redirect("/");
});

Deno.serve(app.fetch);
