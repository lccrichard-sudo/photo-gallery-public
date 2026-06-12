"""把 photo_descriptions.json 裡的中文說明寫回 Flickr 相片的說明欄位。
若 Flickr 上該相片已有說明，保留原說明，新說明附加在下方。

測試模式（預設）：只處理指定的 1-2 張相片，並印出 before/after，不會真的寫入。
加上 --apply 才會真的呼叫 flickr.photos.setMeta 寫入。

用法：
  python flickr_write_descriptions.py <photo_id> [<photo_id> ...]          # 測試（不寫入）
  python flickr_write_descriptions.py <photo_id> [<photo_id> ...] --apply  # 真的寫入
  python flickr_write_descriptions.py --all --apply                        # 全部 544 張，真的寫入
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
DESC_PATH = BASE_DIR / "photo_descriptions.json"

flickr = flickrapi.FlickrAPI(
    API_KEY, API_SECRET, format="parsed-json", token_cache_location=str(TOKEN_CACHE)
)


def build_new_description(current, local):
    current = (current or "").strip()
    local = (local or "").strip()
    if not current:
        return local
    if local in current:
        return current
    return current + "\n\n" + local


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    args = [a for a in args if a != "--apply"]

    descriptions = json.loads(DESC_PATH.read_text(encoding="utf-8"))

    if "--all" in args:
        photo_ids = list(descriptions.keys())
    else:
        photo_ids = args

    if not photo_ids:
        print("請指定 photo_id，或加 --all")
        return

    for photo_id in photo_ids:
        local_desc = descriptions.get(photo_id, "")
        if not local_desc:
            print(f"[{photo_id}] photo_descriptions.json 沒有對應說明，略過")
            continue

        info = flickr.photos.getInfo(photo_id=photo_id)
        photo = info["photo"]
        title = photo["title"]["_content"]
        current_desc = photo["description"]["_content"]

        new_desc = build_new_description(current_desc, local_desc)

        print(f"=== {photo_id} ({title}) ===")
        print("--- 目前說明 ---")
        print(current_desc or "(空)")
        print("--- 寫入後說明 ---")
        print(new_desc)
        print()

        if apply:
            if new_desc != current_desc:
                flickr.photos.setMeta(photo_id=photo_id, title=title, description=new_desc)
                print(f"[{photo_id}] 已寫入 Flickr")
            else:
                print(f"[{photo_id}] 內容未變更，略過寫入")
        else:
            print(f"[{photo_id}] 測試模式，未寫入（加 --apply 才會寫入）")
        print()


if __name__ == "__main__":
    main()
