import os

import dotenv

dotenv.load_dotenv()

FILESTASH_URL = os.environ['FILESTASH_URL']
FILESTASH_API_KEY = os.environ['FILESTASH_API_KEY']
API_PREFIX = os.environ.get('API_PREFIX', '/api/minio')

KEYCLOAK_URL = os.environ['KEYCLOAK_URL']
KEYCLOAK_REALM = os.environ['KEYCLOAK_REALM']

MINIO_URL = os.environ['MINIO_URL']
MINIO_KEYCLOAK_CLIENT_ID = os.environ['MINIO_KEYCLOAK_CLIENT_ID']
MINIO_KEYCLOAK_CLIENT_SECRET = os.environ['MINIO_KEYCLOAK_CLIENT_SECRET']
