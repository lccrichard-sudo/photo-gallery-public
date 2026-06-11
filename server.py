import json
import os
import threading
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

API_KEY = os.environ["FLICKR_API_KEY"]
USER_ID = os.environ["FLICKR_USER_ID"]

API_URL = "https://api.flickr.com/services/rest/"
INDEX_PATH = BASE_DIR / "album_tags_index.json"

index_status = {"running": False, "done": 0, "total": 0}

app = Flask(__name__, static_folder="static", static_url_path="")


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


def get_all_albums():
    albums = []
    page = 1
    while True:
        resp = requests.get(
            API_URL,
            params={
                "method": "flickr.photosets.getList",
                "api_key": API_KEY,
                "user_id": USER_ID,
                "format": "json",
                "nojsoncallback": 1,
                "page": page,
                "per_page": 500,
            },
        )
        data = resp.json()
        if data.get("stat") != "ok":
            raise RuntimeError(data.get("message"))
        photosets = data["photosets"]
        albums.extend(photosets["photoset"])
        if page >= photosets["pages"]:
            break
        page += 1
    return albums


@app.route("/api/albums")
def api_albums():
    try:
        albums = get_all_albums()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(albums)


def get_album_tags(album_id):
    tags = set()
    page = 1
    while True:
        resp = requests.get(
            API_URL,
            params={
                "method": "flickr.photosets.getPhotos",
                "api_key": API_KEY,
                "photoset_id": album_id,
                "user_id": USER_ID,
                "format": "json",
                "nojsoncallback": 1,
                "extras": "tags,description",
                "page": page,
                "per_page": 500,
            },
        )
        data = resp.json()
        if data.get("stat") != "ok":
            break
        photoset = data["photoset"]
        for photo in photoset["photo"]:
            for tag in photo.get("tags", "").split():
                tags.add(tag)
            desc = photo.get("description", {}).get("_content", "").strip()
            if desc:
                tags.add(desc)
        if page >= photoset.get("pages", 1):
            break
        page += 1
    return sorted(tags)


def build_index():
    index_status["running"] = True
    index_status["done"] = 0
    try:
        albums = get_all_albums()
        index_status["total"] = len(albums)

        result = {}
        if INDEX_PATH.exists():
            result = json.loads(INDEX_PATH.read_text(encoding="utf-8"))

        for i, album in enumerate(albums):
            result[album["id"]] = get_album_tags(album["id"])
            index_status["done"] = i + 1
            INDEX_PATH.write_text(
                json.dumps(result, ensure_ascii=False), encoding="utf-8"
            )
    finally:
        index_status["running"] = False


@app.route("/api/build_index", methods=["POST"])
def api_build_index():
    if index_status["running"]:
        return jsonify({"status": "already_running"})
    threading.Thread(target=build_index, daemon=True).start()
    return jsonify({"status": "started"})


@app.route("/api/build_index/status")
def api_build_index_status():
    return jsonify(index_status)


@app.route("/api/search_index")
def api_search_index():
    if INDEX_PATH.exists():
        return jsonify(json.loads(INDEX_PATH.read_text(encoding="utf-8")))
    return jsonify({})


@app.route("/api/album/<album_id>/photos")
def api_album_photos(album_id):
    resp = requests.get(
        API_URL,
        params={
            "method": "flickr.photosets.getPhotos",
            "api_key": API_KEY,
            "photoset_id": album_id,
            "user_id": USER_ID,
            "format": "json",
            "nojsoncallback": 1,
            "extras": "url_s,url_m,url_c,url_l,url_h,url_k,url_o",
        },
    )
    data = resp.json()
    if data.get("stat") != "ok":
        return jsonify({"error": data.get("message")}), 400
    return jsonify(data["photoset"])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8767))
    app.run(host="0.0.0.0", port=port, debug=False)
