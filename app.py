
from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session
)
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from dotenv import load_dotenv
from datetime import datetime
import os
import secrets

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "complaint_portal")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]

users_collection = db["users"]
complaints_collection = db["complaints"]



# Create unique email index
users_collection.create_index("email", unique=True)


# Login protection
def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Please login first"}), 401
            return redirect(url_for("login"))
        return function(*args, **kwargs)
    return wrapper


# Home / Dashboard
@app.route("/")
@login_required
def home():
    return render_template("index.html")


# Registration page
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
            "register.html", error="Please fill all fields."
        )

    if len(password) < 6:
        return render_template(
            "register.html", error="Password must contain at least 6 characters."
        )

    if password != confirm_password:
        return render_template(
            "register.html", error="Passwords do not match."
        )

    try:
        users_collection.insert_one({
            "name": name,
            "email": email,
            "password": generate_password_hash(password),
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

        return redirect(url_for("login", registered="1"))

    except Exception as e:
        if "duplicate key" in str(e).lower():
            return render_template(
                "register.html", error="This email is already registered."
            )
        return render_template(
            "register.html", error="Registration failed. Please try again."
        )


# Login page
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

    user = users_collection.find_one({"email": email})

    if user and check_password_hash(user["password"], password):
        session["user_id"] = str(user["_id"])
        session["user_name"] = user["name"]
        session["user_email"] = user["email"]
        return redirect(url_for("home"))

    return render_template(
        "login.html", error="Invalid email or password."
    )


# Logout
@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# User profile API
@app.route("/api/profile", methods=["GET"])
@login_required
def profile():
    return jsonify({
        "name": session.get("user_name"),
        "email": session.get("user_email")
    })


# Check API and MongoDB connection
@app.route("/api/health", methods=["GET"])
def health():
    try:
        client.admin.command("ping")
        return jsonify({
            "api": "Running",
            "mongodb": "Connected"
        }), 200
    except Exception as e:
        return jsonify({
            "api": "Running",
            "mongodb": "Disconnected",
            "error": str(e)
        }), 500


# Register a new complaint
@app.route("/api/complaints", methods=["POST"])
@login_required
def add_complaint():
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "Invalid data"}), 400

        required_fields = [
            "name", "email", "category",
            "subject", "description"
        ]

        for field in required_fields:
            if not data.get(field) or not str(data[field]).strip():
                return jsonify({
                    "error": f"{field} is required"
                }), 400

        complaint = {
            "name": str(data["name"]).strip(),
            "email": str(data["email"]).strip(),
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

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Get complaints
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

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Update complaint status
@app.route("/api/complaints/<complaint_id>", methods=["PUT"])
@login_required
def update_complaint(complaint_id):
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "Invalid data"}), 400

        status = data.get("status")

        allowed_statuses = [
            "Pending",
            "In Progress",
            "Resolved"
        ]

        if status not in allowed_statuses:
            return jsonify({"error": "Invalid status"}), 400

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
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Delete complaint
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
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==============================
# CONTRACTOR MANAGEMENT API
# ==============================

contractors_collection = db["contractors"]


# GET: Display all contractors
@app.route("/api/contractors", methods=["GET"])
def get_contractors():

    if "user_id" not in session:
        return jsonify({"error": "Please login"}), 401

    contractors = list(contractors_collection.find())

    for contractor in contractors:
        contractor["_id"] = str(contractor["_id"])

    return jsonify(contractors), 200


# POST: Add new contractor
@app.route("/api/contractors", methods=["POST"])
def add_contractor():

    if "user_id" not in session:
        return jsonify({"error": "Please login"}), 401

    data = request.get_json()

    if not data or not all(data.get(key) for key in
                           ["name", "category", "phone", "status"]):
        return jsonify({"error": "All fields are required"}), 400

    contractor = {
        "name": data["name"],
        "category": data["category"],
        "phone": data["phone"],
        "status": data["status"]
    }

    result = contractors_collection.insert_one(contractor)

    return jsonify({
        "message": "Contractor added successfully",
        "id": str(result.inserted_id)
    }), 201


# PUT: Update contractor
@app.route("/api/contractors/<contractor_id>", methods=["PUT"])
def update_contractor(contractor_id):

    if "user_id" not in session:
        return jsonify({"error": "Please login"}), 401

    try:
        data = request.get_json()

        result = contractors_collection.update_one(
            {"_id": ObjectId(contractor_id)},
            {"$set": {
                "name": data["name"],
                "category": data["category"],
                "phone": data["phone"],
                "status": data["status"]
            }}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Contractor not found"}), 404

        return jsonify({"message": "Contractor updated successfully"})

    except (InvalidId, KeyError, TypeError):
        return jsonify({"error": "Invalid contractor data or ID"}), 400


# DELETE: Remove contractor
@app.route("/api/contractors/<contractor_id>", methods=["DELETE"])
def delete_contractor(contractor_id):

    if "user_id" not in session:
        return jsonify({"error": "Please login"}), 401

    try:
        result = contractors_collection.delete_one(
            {"_id": ObjectId(contractor_id)}
        )

        if result.deleted_count == 0:
            return jsonify({"error": "Contractor not found"}), 404

        return jsonify({"message": "Contractor deleted successfully"})

    except InvalidId:
        return jsonify({"error": "Invalid contractor ID"}), 400
   


# Run Flask application
if __name__ == "__main__":
    app.run(debug=True)
