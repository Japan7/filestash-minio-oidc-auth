import xmltodict
from aiohttp import ClientSession
from aiohttp.formdata import FormData
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from toolz.curried import memoize

from .settings import (
    API_PREFIX,
    FILESTASH_API_KEY,
    FILESTASH_URL,
    KEYCLOAK_REALM,
    KEYCLOAK_URL,
    MINIO_KEYCLOAK_CLIENT_ID,
    MINIO_KEYCLOAK_CLIENT_SECRET,
    MINIO_URL,
)

BASE_OIDC_URL = f'{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect'
FILESTASH_REDIRECT_URI = f'{FILESTASH_URL}{API_PREFIX}/callback'

app = FastAPI()


@memoize
def get_session() -> ClientSession:
    return ClientSession()


@app.get('/login')
async def login():
    return RedirectResponse(f'{API_PREFIX}/login', status_code=301)


@app.get(f'{API_PREFIX}/login')
async def keycloak_login():
    return RedirectResponse(f'{BASE_OIDC_URL}/auth?client_id={MINIO_KEYCLOAK_CLIENT_ID}'
                            f'&redirect_uri={FILESTASH_REDIRECT_URI}&response_type=code&scope=openid')


@app.get(f'{API_PREFIX}/callback')
async def keycloak_callback(code: str):
    token_form = FormData(dict(
        client_id=MINIO_KEYCLOAK_CLIENT_ID,
        client_secret=MINIO_KEYCLOAK_CLIENT_SECRET,
        grant_type='authorization_code',
        code=code,
        redirect_uri=FILESTASH_REDIRECT_URI,
    ))
    async with get_session().post(f'{BASE_OIDC_URL}/token', data=token_form) as resp:
        data = await resp.json()
        access_token = data['access_token']

    params = dict(Action='AssumeRoleWithWebIdentity',
                  WebIdentityToken=access_token,
                  Version='2011-06-15')
    async with get_session().post(MINIO_URL, params=params) as resp:
        data = xmltodict.parse(await resp.text())
        creds = data['AssumeRoleWithWebIdentityResponse']['AssumeRoleWithWebIdentityResult']['Credentials']  # noqa

    filestash_json = dict(
        type='s3',
        endpoint=MINIO_URL,
        access_key_id=creds['AccessKeyId'],
        secret_access_key=creds['SecretAccessKey'],
        session_token=creds['SessionToken'],
    )
    async with get_session().post(f'{FILESTASH_URL}/api/session',
                                  params=dict(key=FILESTASH_API_KEY),
                                  json=filestash_json) as resp:
        set_cookie = resp.headers['Set-Cookie']
    return RedirectResponse('/', headers={'Set-Cookie': set_cookie})


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', forwarded_allow_ips='*')
