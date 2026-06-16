import json
import os
import threading
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

LIKES_PATH = BASE_DIR / "likes.json"
likes_lock = threading.Lock()

def load_likes():
    if LIKES_PATH.exists():
        return json.loads(LIKES_PATH.read_text(encoding="utf-8"))
    return {}

def save_likes(data):
    LIKES_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr

API_KEY = os.environ["FLICKR_API_KEY"]
USER_ID = os.environ["FLICKR_USER_ID"]

API_URL = "https://api.flickr.com/services/rest/"
INDEX_PATH = BASE_DIR / "album_tags_index.json"
DESC_PATH = BASE_DIR / "photo_descriptions.json"

index_status = {"running": False, "done": 0, "total": 0}


def load_photo_descriptions():
    if DESC_PATH.exists():
        return json.loads(DESC_PATH.read_text(encoding="utf-8"))
    return {}

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
        descriptions = load_photo_descriptions()
        for photo in photoset["photo"]:
            for tag in photo.get("tags", "").split():
                tags.add(tag)
            desc = photo.get("description", {}).get("_content", "").strip()
            if desc:
                tags.add(desc)
            local_desc = descriptions.get(photo["id"], "").strip()
            if local_desc:
                tags.add(local_desc)
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
            "extras": "url_s,url_m,url_c,url_l,url_h,url_k,url_o,description",
        },
    )
    data = resp.json()
    if data.get("stat") != "ok":
        return jsonify({"error": data.get("message")}), 400

    return jsonify(data["photoset"])


@app.route("/api/likes/<photo_id>")
def api_get_likes(photo_id):
    likes = load_likes()
    entry = likes.get(photo_id, {"count": 0, "ips": []})
    ip = get_client_ip()
    return jsonify({"count": entry["count"], "liked_by_ip": ip in entry["ips"]})

@app.route("/api/likes/<photo_id>", methods=["POST"])
def api_post_like(photo_id):
    ip = get_client_ip()
    with likes_lock:
        likes = load_likes()
        entry = likes.setdefault(photo_id, {"count": 0, "ips": []})
        if ip in entry["ips"]:
            entry["ips"].remove(ip)
            entry["count"] = max(0, entry["count"] - 1)
            save_likes(likes)
            return jsonify({"count": entry["count"], "liked": False})
        entry["ips"].append(ip)
        entry["count"] += 1
        save_likes(likes)
    return jsonify({"count": entry["count"], "liked": True})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8767))
    app.run(host="0.0.0.0", port=port, debug=False)
