const API = "/api/complaints";

let complaints = [];

const form = document.getElementById("complaintForm");
const modal = document.getElementById("reportModal");
const complaintList = document.getElementById("complaintList");
const searchInput = document.getElementById("searchInput");

// Escape HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

// Open modal
function openModal() {
    modal.classList.add("show");
}

// Close modal
function closeModal() {
    modal.classList.remove("show");
}

document.getElementById("newReportBtn").onclick = openModal;
document.getElementById("newReportBtn2").onclick = openModal;
document.getElementById("closeModal").onclick = closeModal;


// Sidebar Navigation
document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", function () {

        const pageId = this.dataset.page;

        document.querySelectorAll(".page").forEach(page => {
            page.classList.remove("active");
        });

        document.getElementById(pageId).classList.add("active");

        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.remove("active");
        });

        this.classList.add("active");
    });
});


// Load Complaints
async function loadComplaints() {
    try {
        const response = await fetch(API);

        if (!response.ok) {
            throw new Error("Unable to load complaints");
        }

        complaints = await response.json();

        updateDashboard();
        updateAnalytics();
        displayComplaints(complaints, "complaintList");
        displayComplaints(complaints.slice(0, 3), "dashboardReports");

    } catch (error) {
        console.error(error);
        complaintList.innerHTML = "<p>Unable to load complaints.</p>";
    }
}


// Dashboard Counters
function updateDashboard() {

    const total = complaints.length;

    const pending = complaints.filter(
        c => c.status === "Pending"
    ).length;

    const progress = complaints.filter(
        c => c.status === "In Progress"
    ).length;

    const resolved = complaints.filter(
        c => c.status === "Resolved"
    ).length;

    document.getElementById("totalCount").textContent = total;
    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("progressCount").textContent = progress;
    document.getElementById("resolvedCount").textContent = resolved;

    document.getElementById("monthCount").textContent =
        total + " reports";

    document.getElementById("monthBar").style.width =
        (total === 0 ? 0 : 100) + "%";

    // Analytics page
    document.getElementById("analyticsTotal").textContent = total;
    document.getElementById("analyticsPending").textContent = pending;
    document.getElementById("analyticsProgress").textContent = progress;
    document.getElementById("analyticsResolved").textContent = resolved;
}


// Display Complaint Cards
function displayComplaints(data, elementId) {

    const container = document.getElementById(elementId);

    if (data.length === 0) {
        container.innerHTML = "<p>No reports available.</p>";
        return;
    }

    container.innerHTML = data.map(c => {

        const status = c.status || "Pending";
        const id = c.id || c._id;

        let statusClass = "pending";

        if (status === "In Progress") {
            statusClass = "in-progress";
        } else if (status === "Resolved") {
            statusClass = "resolved";
        }

        const progressValue =
            status === "Resolved" ? 100 :
            status === "In Progress" ? 50 : 0;

        return `
            <div class="report-card">

                <h3>${escapeHTML(c.subject)}</h3>

                <span class="status ${statusClass}">
                    ${escapeHTML(status)}
                </span>

                <p>${escapeHTML(c.description)}</p>

                <p><b>Name:</b> ${escapeHTML(c.name)}</p>
                <p><b>Email:</b> ${escapeHTML(c.email)}</p>
                <p><b>Category:</b> ${escapeHTML(c.category)}</p>
                <p><b>Date:</b> ${escapeHTML(c.date || "Not available")}</p>

                <p><b>Progress:</b> ${progressValue}%</p>

                <div class="bar">
                    <span style="width:${progressValue}%"></span>
                </div>

                <select onchange="updateStatus('${id}', this.value)">
                    <option value="Pending" ${status === "Pending" ? "selected" : ""}>Pending</option>
                    <option value="In Progress" ${status === "In Progress" ? "selected" : ""}>In Progress</option>
                    <option value="Resolved" ${status === "Resolved" ? "selected" : ""}>Resolved</option>
                </select>

                <button class="delete-btn"
                    onclick="deleteComplaint('${id}')">
                    Delete
                </button>

            </div>
        `;
    }).join("");
}


// Submit New Complaint
form.addEventListener("submit", async function(event) {

    event.preventDefault();

    const complaint = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        category: document.getElementById("category").value,
        subject: document.getElementById("subject").value.trim(),
        description: document.getElementById("description").value.trim()
    };

    try {

        const response = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(complaint)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Submission failed");
        }

        alert("Report submitted successfully!");

        form.reset();
        closeModal();

        await loadComplaints();

    } catch (error) {
        alert(error.message);
    }
});


// Update Status
async function updateStatus(id, status) {

    try {

        const response = await fetch(`${API}/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Update failed");
        }

        alert("Status updated successfully!");

        await loadComplaints();

    } catch (error) {
        alert(error.message);
    }
}


// Delete Complaint
async function deleteComplaint(id) {

    if (!confirm("Are you sure you want to delete this report?")) {
        return;
    }

    try {

        const response = await fetch(`${API}/${id}`, {
            method: "DELETE"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Delete failed");
        }

        alert("Report deleted successfully!");

        await loadComplaints();

    } catch (error) {
        alert(error.message);
    }
}


// Search Reports
searchInput.addEventListener("input", function() {

    const search = this.value.toLowerCase();

    const filtered = complaints.filter(c =>
        [c.name, c.email, c.category, c.subject, c.description]
            .some(value =>
                String(value || "").toLowerCase().includes(search)
            )
    );

    displayComplaints(filtered, "complaintList");
});


// Dark Mode
document.getElementById("themeBtn").onclick = function() {
    document.body.classList.toggle("dark");
};


// Logout Demo
document.getElementById("logoutBtn").onclick = function() {
    window.location.href = "/logout";
};


// Initial Load
loadComplaints();


async function loadProfile() {
    try {
        const response = await fetch("/api/profile");

        if (!response.ok) {
            throw new Error("Unable to load profile");
        }

        const user = await response.json();

        document.getElementById("profileName").value =
            user.name || "";

        document.getElementById("profileEmail").value =
            user.email || "";

    } catch (error) {
        console.error("Profile error:", error);
    }
}

loadProfile();


let statusChart = null;
let categoryChart = null;

function updateAnalytics() {

    const total = complaints.length;

    const pending = complaints.filter(
        c => c.status === "Pending"
    ).length;

    const progress = complaints.filter(
        c => c.status === "In Progress"
    ).length;

    const resolved = complaints.filter(
        c => c.status === "Resolved"
    ).length;

    // Resolution Summary
    document.getElementById("summaryTotal").textContent = total;
    document.getElementById("summaryResolved").textContent = resolved;

    const rate = total > 0
        ? Math.round((resolved / total) * 100)
        : 0;

    document.getElementById("resolutionRate").textContent = rate + "%";

    // Check Chart.js
    if (typeof Chart === "undefined") {
        console.error("Chart.js is not loaded");
        return;
    }

    // Status Doughnut Chart
    const statusCanvas = document.getElementById("statusChart");

    if (statusCanvas) {

        if (statusChart) statusChart.destroy();

        statusChart = new Chart(statusCanvas, {
            type: "doughnut",

            data: {
                labels: ["Pending", "In Progress", "Resolved"],

                datasets: [{
                    data: [pending, progress, resolved],

                    backgroundColor: [
                        "#f59e0b",
                        "#3b82f6",
                        "#22c55e"
                    ],

                    borderWidth: 3,
                    borderColor: "#ffffff",
                    hoverOffset: 15
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        position: "bottom"
                    },

                    tooltip: {
                        enabled: true
                    }
                },

                animation: {
                    animateScale: true,
                    duration: 1200
                },

                cutout: "60%"
            }
        });
    }

    // Category Bar Chart
    const categories = {};

    complaints.forEach(c => {
        const category = c.category || "Other";

        categories[category] =
            (categories[category] || 0) + 1;
    });

    const categoryCanvas = document.getElementById("categoryChart");

    if (categoryCanvas) {

        if (categoryChart) categoryChart.destroy();

        categoryChart = new Chart(categoryCanvas, {
            type: "bar",

            data: {
                labels: Object.keys(categories),

                datasets: [{
                    label: "Number of Complaints",

                    data: Object.values(categories),

                    backgroundColor: "#14b8a6",
                    borderRadius: 8,
                    maxBarThickness: 55
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        position: "bottom"
                    }
                },

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },

                animation: {
                    duration: 1200
                }
            }
        });
    }
}

// CONTRACTOR SEARCH AND FILTER

// CONTRACTOR SEARCH AND FILTER

function setupContractorSearch() {

    const searchInput = document.getElementById("contractorSearch");
    const categoryFilter = document.getElementById("contractorFilter");

    if (!searchInput || !categoryFilter) return;

    const cards = document.querySelectorAll(".contractor-card");

    function filterContractors() {

        const search = searchInput.value.toLowerCase().trim();
        const category = categoryFilter.value;

        cards.forEach(card => {

            const name = card.querySelector("h2").textContent.toLowerCase();
            const service = card.querySelector(".service").textContent;

            const nameMatch = name.includes(search);

            const categoryMatch =
                category === "All" || service === category;

            card.style.display =
                nameMatch && categoryMatch ? "" : "none";
        });
    }

    searchInput.addEventListener("input", filterContractors);
    categoryFilter.addEventListener("change", filterContractors);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupContractorSearch);
} else {
    setupContractorSearch();
}


// CONTRACTOR SEARCH FUNCTION

function setupContractorSearch() {

    const searchInput = document.getElementById("contractorSearch");
    const categoryFilter = document.getElementById("contractorFilter");
    const cards = document.querySelectorAll(".contractor-card");

    if (!searchInput) {
        console.log("Contractor search input not found");
        return;
    }

    function filterContractors() {

        const searchText = searchInput.value.toLowerCase().trim();
        const selectedCategory = categoryFilter
            ? categoryFilter.value
            : "All";

        cards.forEach(card => {

            const name = card.querySelector("h2")
                .textContent.toLowerCase();

            const category = card.dataset.category;

            const nameMatch = name.includes(searchText);

            const categoryMatch =
                selectedCategory === "All" ||
                category === selectedCategory;

            card.style.display =
                nameMatch && categoryMatch ? "" : "none";
        });
    }

    searchInput.addEventListener("input", filterContractors);

    if (categoryFilter) {
        categoryFilter.addEventListener("change", filterContractors);
    }

    console.log("Contractor search is ready!");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupContractorSearch);
} else {
    setupContractorSearch();
}

// LOAD CONTRACTORS FROM MONGODB API


let editingContractorId = null;

// LOAD CONTRACTORS
async function loadContractors() {

    const container = document.getElementById("contractorList");
    if (!container) return;

    try {
        const response = await fetch("/api/contractors");

        if (!response.ok) {
            throw new Error("Unable to load contractors");
        }

        const contractors = await response.json();
        container.innerHTML = "";

        contractors.forEach(contractor => {
            const card = document.createElement("div");
            card.className = "contractor-card";

            const name = document.createElement("h2");
            name.textContent = contractor.name;

            const category = document.createElement("p");
            category.className = "service";
            category.textContent = contractor.category;

            const phone = document.createElement("p");
            phone.textContent = "📞 " + contractor.phone;

            const status = document.createElement("span");
            status.className = "work-status " +
                contractor.status.toLowerCase().replace(" ", "-");
            status.textContent = contractor.status;

            const editButton = document.createElement("button");
            editButton.textContent = "Edit";
            editButton.type = "button";

            editButton.addEventListener("click", () => {
                editingContractorId = contractor._id;

                document.getElementById("newContractorName").value = contractor.name;
                document.getElementById("newContractorCategory").value = contractor.category;
                document.getElementById("newContractorPhone").value = contractor.phone;
                document.getElementById("newContractorStatus").value = contractor.status;

                document.querySelector("#contractorForm button[type='submit']")
                    .textContent = "Update Contractor";

                document.getElementById("contractorForm")
                    .scrollIntoView({ behavior: "smooth" });
            });
            
const deleteButton = document.createElement("button");
deleteButton.textContent = "Delete";
deleteButton.type = "button";

deleteButton.addEventListener("click", async () => {

    const confirmDelete = confirm(
        "Are you sure you want to delete " + contractor.name + "?"
    );

    if (!confirmDelete) return;

    try {
        const response = await fetch(
            `/api/contractors/${contractor._id}`,
            { method: "DELETE" }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Delete failed");
        }

        alert("Contractor deleted successfully!");

        await loadContractors();

    } catch (error) {
        alert(error.message);
        console.error(error);
    }
});


        card.append(name, category, phone, status, editButton , deleteButton);            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        container.textContent = "Unable to load contractors.";
    }
}


// ADD AND UPDATE CONTRACTOR
const contractorForm = document.getElementById("contractorForm");

if (contractorForm) {
    contractorForm.addEventListener("submit", async function(e) {
        e.preventDefault();

        const contractor = {
            name: document.getElementById("newContractorName").value.trim(),
            category: document.getElementById("newContractorCategory").value,
            phone: document.getElementById("newContractorPhone").value.trim(),
            status: document.getElementById("newContractorStatus").value
        };

        const message = document.getElementById("contractorMessage");
        const isEditing = editingContractorId !== null;

        const url = isEditing
            ? `/api/contractors/${editingContractorId}`
            : "/api/contractors";

        try {
            const response = await fetch(url, {
                method: isEditing ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(contractor)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Operation failed");
            }

            message.textContent = isEditing
                ? "Contractor updated successfully!"
                : "Contractor added successfully!";

            message.style.color = "green";

            editingContractorId = null;
            contractorForm.reset();

            document.querySelector("#contractorForm button[type='submit']")
                .textContent = "Add Contractor";

            await loadContractors();

        } catch (error) {
            message.textContent = error.message;
            message.style.color = "red";
            console.error(error);
        }
    });
}

loadContractors();

// CONTRACTOR CATEGORY FILTER

const categoryFilter = document.getElementById(
    "contractorCategoryFilter"
);

if (categoryFilter) {
    categoryFilter.addEventListener("change", function () {
        const selectedCategory = this.value;
        const cards = document.querySelectorAll(
            "#contractorList .contractor-card"
        );

        cards.forEach(card => {
            const category = card.querySelector(".service").textContent;

            card.style.display =
                selectedCategory === "All" ||
                category === selectedCategory
                    ? ""
                    : "none";
        });
    });
}
