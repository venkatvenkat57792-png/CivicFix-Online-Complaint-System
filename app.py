
from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session
)
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from bson.objectid import ObjectId
from bson.errors import InvalidId
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from dotenv import load_dotenv
from datetime import datetime
import os
import secrets

# ==========================================
# ENVIRONMENT CONFIGURATION
# ==========================================

load_dotenv()

app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.getenv("RENDER"))
)

# ==========================================
# MONGODB ATLAS CONNECTION
# ==========================================

MONGO_URI = os.getenv("MONGO_URI")

# Local connection is allowed only for local development.
if not MONGO_URI:
    if os.getenv("RENDER"):
        raise RuntimeError("MONGO_URI is missing in Render Environment.")
    MONGO_URI = "mongodb://localhost:27017/"

DB_NAME = os.getenv("DB_NAME", "complaint_portal")

client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000
)

db = client[DB_NAME]

users_collection = db["users"]
complaints_collection = db["complaints"]
contractors_collection = db["contractors"]

# Admin email is configured through environment variables.
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()


# ==========================================
# AUTHENTICATION DECORATORS
# ==========================================

def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if "user_id" not in session:

            if request.path.startswith("/api/"):
                return jsonify({"error": "Please login first"}), 401

            return redirect(url_for("login"))

        return function(*args, **kwargs)

    return wrapper


def admin_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if "user_id" not in session:
            return jsonify({"error": "Please login first"}), 401

        if not ADMIN_EMAIL or session.get("user_email") != ADMIN_EMAIL:
            return jsonify({"error": "Admin access required"}), 403

        return function(*args, **kwargs)

    return wrapper


# ==========================================
# HOME / DASHBOARD
# ==========================================

@app.route("/")
@login_required
def home():
    return render_template("index.html")


# ==========================================
# USER REGISTRATION
# ==========================================

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "GET":
        return render_template("register.html")

    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")
    confirm_password = request.form.get("confirm_password", "")

    if not name or not email or not password or not confirm_password:
        return render_template(
            "register.html",
            error="Please fill all fields."
        )

    if len(password) < 6:
        return render_template(
            "register.html",
            error="Password must contain at least 6 characters."
        )

    if password != confirm_password:
        return render_template(
            "register.html",
            error="Passwords do not match."
        )

    try:
        # Create unique email index when needed.
        users_collection.create_index("email", unique=True)

        users_collection.insert_one({
            "name": name,
            "email": email,
            "password": generate_password_hash(password),
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

        return redirect(url_for("login", registered="1"))

    except DuplicateKeyError:
        return render_template(
            "register.html",
            error="This email is already registered."
        )

    except PyMongoError:
        return render_template(
            "register.html",
            error="Database connection failed. Please try again."
        )


# ==========================================
# USER LOGIN
# ==========================================

@app.route("/login", methods=["GET", "POST"])
def login():

    if "user_id" in session:
        return redirect(url_for("home"))

    if request.method == "GET":
        return render_template(
            "login.html",
            registered=request.args.get("registered")
        )

    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    if not email or not password:
        return render_template(
            "login.html",
            error="Please enter email and password."
        )

    try:
        user = users_collection.find_one({"email": email})

        if user and check_password_hash(user["password"], password):

            session.clear()
            session["user_id"] = str(user["_id"])
            session["user_name"] = user["name"]
            session["user_email"] = user["email"]

            return redirect(url_for("home"))

        return render_template(
            "login.html",
            error="Invalid email or password."
        )

    except PyMongoError:
        return render_template(
            "login.html",
            error="Database connection failed."
        )


# ==========================================
# LOGOUT
# ==========================================

@app.route("/logout")
def logout():

    session.clear()

    return redirect(url_for("login"))


# ==========================================
# USER PROFILE API
# ==========================================

@app.route("/api/profile", methods=["GET"])
@login_required
def profile():

    return jsonify({
        "name": session.get("user_name"),
        "email": session.get("user_email")
    }), 200


# ==========================================
# API AND DATABASE HEALTH CHECK
# ==========================================

@app.route("/api/health", methods=["GET"])
def health():

    try:
        client.admin.command("ping")

        return jsonify({
            "api": "Running",
            "mongodb": "Connected"
        }), 200

    except PyMongoError:
        return jsonify({
            "api": "Running",
            "mongodb": "Disconnected"
        }), 503


# ==========================================
# REGISTER A NEW COMPLAINT
# ==========================================

@app.route("/api/complaints", methods=["POST"])
@login_required
def add_complaint():

    try:
        data = request.get_json(silent=True)

        if not isinstance(data, dict):
            return jsonify({"error": "Invalid data"}), 400

        required_fields = [
            "name", "email", "category",
            "subject", "description"
        ]

        for field in required_fields:

            if not str(data.get(field, "")).strip():
                return jsonify({
                    "error": f"{field} is required"
                }), 400

        complaint = {
            "name": str(data["name"]).strip(),
            "email": str(data["email"]).strip().lower(),
            "category": str(data["category"]).strip(),
            "subject": str(data["subject"]).strip(),
            "description": str(data["description"]).strip(),
            "status": "Pending",
            "user_id": session["user_id"],
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        result = complaints_collection.insert_one(complaint)

        return jsonify({
            "message": "Complaint registered successfully",
            "id": str(result.inserted_id)
        }), 201

    except PyMongoError:
        return jsonify({"error": "Database operation failed"}), 503


# ==========================================
# GET USER COMPLAINTS
# ==========================================

@app.route("/api/complaints", methods=["GET"])
@login_required
def get_complaints():

    try:
        complaints = list(
            complaints_collection.find({
                "user_id": session["user_id"]
            }).sort("_id", -1)
        )

        for complaint in complaints:
            complaint["_id"] = str(complaint["_id"])

        return jsonify(complaints), 200

    except PyMongoError:
        return jsonify({"error": "Unable to fetch complaints"}), 503


# ==========================================
# UPDATE COMPLAINT STATUS
# ==========================================

@app.route("/api/complaints/<complaint_id>", methods=["PUT"])
@login_required
def update_complaint(complaint_id):

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data"}), 400

    status = data.get("status")

    allowed_statuses = [
        "Pending",
        "In Progress",
        "Resolved"
    ]

    if status not in allowed_statuses:
        return jsonify({"error": "Invalid status"}), 400

    try:
        result = complaints_collection.update_one(
            {
                "_id": ObjectId(complaint_id),
                "user_id": session["user_id"]
            },
            {"$set": {"status": status}}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Complaint not found"}), 404

        return jsonify({
            "message": "Complaint status updated successfully"
        }), 200

    except InvalidId:
        return jsonify({"error": "Invalid complaint ID"}), 400

    except PyMongoError:
        return jsonify({"error": "Database operation failed"}), 503


# ==========================================
# DELETE COMPLAINT
# ==========================================

@app.route("/api/complaints/<complaint_id>", methods=["DELETE"])
@login_required
def delete_complaint(complaint_id):

    try:
        result = complaints_collection.delete_one({
            "_id": ObjectId(complaint_id),
            "user_id": session["user_id"]
        })

        if result.deleted_count == 0:
            return jsonify({"error": "Complaint not found"}), 404

        return jsonify({
            "message": "Complaint deleted successfully"
        }), 200

    except InvalidId:
        return jsonify({"error": "Invalid complaint ID"}), 400

    except PyMongoError:
        return jsonify({"error": "Database operation failed"}), 503


# ==========================================
# CONTRACTOR MANAGEMENT API
# ==========================================

# GET ALL CONTRACTORS - logged-in users can view.

@app.route("/api/contractors", methods=["GET"])
@login_required
def get_contractors():

    try:
        contractors = list(contractors_collection.find().sort("_id", -1))

        for contractor in contractors:
            contractor["_id"] = str(contractor["_id"])

        return jsonify(contractors), 200

    except PyMongoError:
        return jsonify({"error": "Unable to fetch contractors"}), 503


# ADD CONTRACTOR - ADMIN ONLY

@app.route("/api/contractors", methods=["POST"])
@login_required
@admin_required
def add_contractor():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data"}), 400

    required_fields = ["name", "category", "phone", "status"]

    for field in required_fields:
        if not str(data.get(field, "")).strip():
            return jsonify({
                "error": f"{field} is required"
            }), 400

    contractor = {
        "name": str(data["name"]).strip(),
        "category": str(data["category"]).strip(),
        "phone": str(data["phone"]).strip(),
        "status": str(data["status"]).strip()
    }

    try:
        result = contractors_collection.insert_one(contractor)

        return jsonify({
            "message": "Contractor added successfully",
            "id": str(result.inserted_id)
        }), 201

    except PyMongoError:
        return jsonify({"error": "Unable to add contractor"}), 503


# UPDATE CONTRACTOR - ADMIN ONLY

@app.route("/api/contractors/<contractor_id>", methods=["PUT"])
@login_required
@admin_required
def update_contractor(contractor_id):

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data"}), 400

    required_fields = ["name", "category", "phone", "status"]

    for field in required_fields:
        if not str(data.get(field, "")).strip():
            return jsonify({
                "error": f"{field} is required"
            }), 400

    try:
        result = contractors_collection.update_one(
            {"_id": ObjectId(contractor_id)},
            {"$set": {
                "name": str(data["name"]).strip(),
                "category": str(data["category"]).strip(),
                "phone": str(data["phone"]).strip(),
                "status": str(data["status"]).strip()
            }}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Contractor not found"}), 404

        return jsonify({
            "message": "Contractor updated successfully"
        }), 200

    except InvalidId:
        return jsonify({"error": "Invalid contractor ID"}), 400

    except PyMongoError:
        return jsonify({"error": "Unable to update contractor"}), 503


# DELETE CONTRACTOR - ADMIN ONLY

@app.route("/api/contractors/<contractor_id>", methods=["DELETE"])
@login_required
@admin_required
def delete_contractor(contractor_id):

    try:
        result = contractors_collection.delete_one({
            "_id": ObjectId(contractor_id)
        })

        if result.deleted_count == 0:
            return jsonify({"error": "Contractor not found"}), 404

        return jsonify({
            "message": "Contractor deleted successfully"
        }), 200

    except InvalidId:
        return jsonify({"error": "Invalid contractor ID"}), 400

    except PyMongoError:
        return jsonify({"error": "Unable to delete contractor"}), 503


# ==========================================
# RUN FLASK APPLICATION
# ==========================================

if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
