"""一次性 Flickr OAuth 授權（write 權限），分兩步執行：

步驟一：python auth_flickr.py            -> 印出授權連結
步驟二：python auth_flickr.py <驗證碼>    -> 用驗證碼換取 access token
"""
import json
import os
import sys
from pathlib import Path

import flickrapi
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

API_KEY = os.environ["FLICKR_API_KEY"]
API_SECRET = os.environ["FLICKR_API_SECRET"]

TOKEN_CACHE = BASE_DIR / "flickr_token_cache"
TOKEN_CACHE.mkdir(exist_ok=True)
REQUEST_TOKEN_FILE = BASE_DIR / "flickr_request_token.json"

flickr = flickrapi.FlickrAPI(
    API_KEY, API_SECRET, format="parsed-json", token_cache_location=str(TOKEN_CACHE)
)

if flickr.token_valid(perms="write"):
    print("已經有有效的 write token，不需要重新授權。")
    sys.exit(0)

if len(sys.argv) > 1:
    verifier = sys.argv[1].strip()
    saved = json.loads(REQUEST_TOKEN_FILE.read_text(encoding="utf-8"))
    flickr.flickr_oauth.oauth.client.resource_owner_key = saved["key"]
    flickr.flickr_oauth.oauth.client.resource_owner_secret = saved["secret"]
    flickr.flickr_oauth.requested_permissions = saved["perms"]
    flickr.get_access_token(verifier)
    REQUEST_TOKEN_FILE.unlink(missing_ok=True)
    print("授權成功！token 已存在", TOKEN_CACHE)
else:
    flickr.get_request_token(oauth_callback="oob")
    authorize_url = flickr.auth_url(perms="write")
    REQUEST_TOKEN_FILE.write_text(
        json.dumps({
            "key": flickr.flickr_oauth.oauth.client.resource_owner_key,
            "secret": flickr.flickr_oauth.oauth.client.resource_owner_secret,
            "perms": flickr.flickr_oauth.requested_permissions,
        }),
        encoding="utf-8",
    )
    print("請打開以下連結並登入授權，取得驗證碼後執行：")
    print(f"  python auth_flickr.py <驗證碼>")
    print()
    print(authorize_url)
