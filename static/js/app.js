const API = "/api/complaints";
const CONTRACTOR_API = "/api/contractors";

let complaints = [];
let editingContractorId = null;

// =====================================
// PAGE ELEMENTS
// =====================================

const form = document.getElementById("complaintForm");
const modal = document.getElementById("reportModal");
const complaintList = document.getElementById("complaintList");
const searchInput = document.getElementById("searchInput");

// =====================================
// API RESPONSE HELPER
// =====================================

async function getResponseData(response) {
    const text = await response.text();

    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { error: text };
    }
}

// =====================================
// ESCAPE HTML
// =====================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

// =====================================
// GET MONGODB ID
// =====================================

function normalizeMongoId(id) {
    if (!id) return "";

    if (typeof id === "string") {
        return id.trim();
    }

    if (typeof id === "object") {
        if (id.$oid) return String(id.$oid);
        if (id.oid) return String(id.oid);
    }

    return "";
}

function getComplaintId(complaint) {
    return normalizeMongoId(
        complaint?.id ?? complaint?._id
    );
}

function getContractorId(contractor) {
    return normalizeMongoId(
        contractor?.id ?? contractor?._id
    );
}

// =====================================
// MODAL FUNCTIONS
// =====================================

function openModal() {
    if (modal) {
        modal.classList.add("show");
    }
}

function closeModal() {
    if (modal) {
        modal.classList.remove("show");
    }
}

document.getElementById("newReportBtn")?.addEventListener(
    "click", openModal
);

document.getElementById("newReportBtn2")?.addEventListener(
    "click", openModal
);

document.getElementById("closeModal")?.addEventListener(
    "click", closeModal
);

// =====================================
// SIDEBAR NAVIGATION
// =====================================

document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", function () {
        const pageId = this.dataset.page;

        document.querySelectorAll(".page").forEach(page => {
            page.classList.remove("active");
        });

        document.getElementById(pageId)?.classList.add("active");

        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.remove("active");
        });

        this.classList.add("active");
    });
});

// =====================================
// LOAD COMPLAINTS
// =====================================

async function loadComplaints() {
    try {
        const response = await fetch(API, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await getResponseData(response);

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to load complaints"
            );
        }

        complaints = Array.isArray(data) ? data : [];

        console.log("Loaded complaints:", complaints);

        updateDashboard();
        updateAnalytics();

        displayComplaints(complaints, "complaintList");

        displayComplaints(
            complaints.slice(0, 3),
            "dashboardReports"
        );

    } catch (error) {
        console.error("Load complaints error:", error);

        if (complaintList) {
            complaintList.innerHTML =
                "<p>Unable to load complaints.</p>";
        }
    }
}

// =====================================
// DASHBOARD COUNTERS
// =====================================

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

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("totalCount", total);
    setText("pendingCount", pending);
    setText("progressCount", progress);
    setText("resolvedCount", resolved);

    setText("monthCount", total + " reports");

    const monthBar = document.getElementById("monthBar");

    if (monthBar) {
        monthBar.style.width =
            (total === 0 ? 0 : 100) + "%";
    }

    setText("analyticsTotal", total);
    setText("analyticsPending", pending);
    setText("analyticsProgress", progress);
    setText("analyticsResolved", resolved);
}

// =====================================
// DISPLAY COMPLAINT CARDS
// =====================================

function displayComplaints(data, elementId) {
    const container = document.getElementById(elementId);

    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = "<p>No reports available.</p>";
        return;
    }

    container.innerHTML = data.map(c => {
        const status = c.status || "Pending";
        const id = getComplaintId(c);

        let statusClass = "pending";

        if (status === "In Progress") {
            statusClass = "in-progress";
        } else if (status === "Resolved") {
            statusClass = "resolved";
        }

        const progressValue =
            status === "Resolved" ? 100 :
            status === "In Progress" ? 50 : 0;

        const safeId = escapeHTML(id);

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

                <select
                    onchange="updateStatus('${safeId}', this.value)"
                    ${id ? "" : "disabled"}
                >
                    <option value="Pending"
                        ${status === "Pending" ? "selected" : ""}>
                        Pending
                    </option>

                    <option value="In Progress"
                        ${status === "In Progress" ? "selected" : ""}>
                        In Progress
                    </option>

                    <option value="Resolved"
                        ${status === "Resolved" ? "selected" : ""}>
                        Resolved
                    </option>
                </select>

                <button
                    class="delete-btn"
                    type="button"
                    onclick="deleteComplaint('${safeId}')"
                    ${id ? "" : "disabled"}
                >
                    Delete
                </button>

            </div>
        `;
    }).join("");
}

// =====================================
// SUBMIT NEW COMPLAINT
// =====================================

if (form) {
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
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(complaint)
            });

            const result = await getResponseData(response);

            if (!response.ok) {
                throw new Error(
                    result.error || "Submission failed"
                );
            }

            alert("Report submitted successfully!");

            form.reset();
            closeModal();

            await loadComplaints();

        } catch (error) {
            console.error("Submit complaint error:", error);
            alert(error.message);
        }
    });
}

// =====================================
// UPDATE COMPLAINT STATUS
// =====================================

async function updateStatus(id, status) {
    if (!id) {
        alert("Complaint ID is missing.");
        return;
    }

    try {
        const response = await fetch(
            `${API}/${encodeURIComponent(id)}`,
            {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

        const result = await getResponseData(response);

        if (!response.ok) {
            throw new Error(
                result.error || "Update failed"
            );
        }

        alert("Status updated successfully!");

        await loadComplaints();

    } catch (error) {
        console.error("Update complaint error:", error);
        alert(error.message);
    }
}

// =====================================
// DELETE COMPLAINT
// =====================================

async function deleteComplaint(id) {
    if (!id) {
        alert("Complaint ID is missing.");
        return;
    }

    const confirmDelete = confirm(
        "Are you sure you want to delete this report?"
    );

    if (!confirmDelete) return;

    try {
        const url =
            `${API}/${encodeURIComponent(id)}`;

        console.log("Deleting complaint ID:", id);
        console.log("Delete API URL:", url);

        const response = await fetch(url, {
            method: "DELETE",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        const result = await getResponseData(response);

        console.log(
            "Delete response:",
            response.status,
            result
        );

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                "Delete failed"
            );
        }

        alert("Report deleted successfully!");

        await loadComplaints();

    } catch (error) {
        console.error("Delete complaint error:", error);
        alert(error.message);
    }
}

// =====================================
// SEARCH REPORTS
// =====================================

if (searchInput) {
    searchInput.addEventListener("input", function() {
        const search = this.value.toLowerCase().trim();

        const filtered = complaints.filter(c =>
            [
                c.name,
                c.email,
                c.category,
                c.subject,
                c.description
            ].some(value =>
                String(value || "")
                    .toLowerCase()
                    .includes(search)
            )
        );

        displayComplaints(filtered, "complaintList");
    });
}

// =====================================
// DARK MODE
// =====================================

document.getElementById("themeBtn")?.addEventListener(
    "click",
    function() {
        document.body.classList.toggle("dark");
    }
);

// =====================================
// LOGOUT
// =====================================

document.getElementById("logoutBtn")?.addEventListener(
    "click",
    function() {
        window.location.href = "/logout";
    }
);

// =====================================
// LOAD PROFILE
// =====================================

async function loadProfile() {
    try {
        const response = await fetch("/api/profile", {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        const user = await getResponseData(response);

        if (!response.ok) {
            throw new Error(
                user.error || "Unable to load profile"
            );
        }

        const profileName =
            document.getElementById("profileName");

        const profileEmail =
            document.getElementById("profileEmail");

        if (profileName) {
            profileName.value = user.name || "";
        }

        if (profileEmail) {
            profileEmail.value = user.email || "";
        }

    } catch (error) {
        console.error("Profile error:", error);
    }
}

// =====================================
// ANALYTICS CHARTS
// =====================================

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

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("summaryTotal", total);
    setText("summaryResolved", resolved);

    const rate = total > 0
        ? Math.round((resolved / total) * 100)
        : 0;

    setText("resolutionRate", rate + "%");

    if (typeof Chart === "undefined") {
        console.error("Chart.js is not loaded");
        return;
    }

    // STATUS DOUGHNUT CHART

    const statusCanvas =
        document.getElementById("statusChart");

    if (statusCanvas) {
        if (statusChart) {
            statusChart.destroy();
        }

        statusChart = new Chart(statusCanvas, {
            type: "doughnut",

            data: {
                labels: [
                    "Pending",
                    "In Progress",
                    "Resolved"
                ],

                datasets: [{
                    data: [
                        pending,
                        progress,
                        resolved
                    ],

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

    // CATEGORY BAR CHART

    const categories = {};

    complaints.forEach(c => {
        const category = c.category || "Other";

        categories[category] =
            (categories[category] || 0) + 1;
    });

    const categoryCanvas =
        document.getElementById("categoryChart");

    if (categoryCanvas) {
        if (categoryChart) {
            categoryChart.destroy();
        }

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

// =====================================
// CONTRACTOR SEARCH AND FILTER
// =====================================

function filterContractors() {
    const contractorSearchInput =
        document.getElementById("contractorSearch");

    const categoryFilter =
        document.getElementById("contractorFilter");

    const search = contractorSearchInput
        ? contractorSearchInput.value.toLowerCase().trim()
        : "";

    const selectedCategory = categoryFilter
        ? categoryFilter.value
        : "All";

    const cards = document.querySelectorAll(
        "#contractorList .contractor-card"
    );

    cards.forEach(card => {
        const name =
            card.querySelector("h2")
                ?.textContent.toLowerCase() || "";

        const category = card.dataset.category || "";

        const nameMatch = name.includes(search);

        const categoryMatch =
            selectedCategory === "All" ||
            category === selectedCategory;

        card.style.display =
            nameMatch && categoryMatch ? "" : "none";
    });
}

// =====================================
// LOAD CONTRACTORS
// =====================================

async function loadContractors() {
    const container =
        document.getElementById("contractorList");

    if (!container) return;

    try {
        const response = await fetch(CONTRACTOR_API, {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        const contractors = await getResponseData(response);

        if (!response.ok) {
            throw new Error(
                contractors.error ||
                "Unable to load contractors"
            );
        }

        container.innerHTML = "";

        if (
            !Array.isArray(contractors) ||
            contractors.length === 0
        ) {
            container.innerHTML =
                "<p>No contractors available.</p>";
            return;
        }

        contractors.forEach(contractor => {
            const card = document.createElement("div");

            const contractorId =
                getContractorId(contractor);

            card.className = "contractor-card";
            card.dataset.category =
                contractor.category || "";

            // CONTRACTOR NAME

            const name = document.createElement("h2");
            name.textContent = contractor.name || "";

            // CATEGORY

            const category = document.createElement("p");
            category.className = "service";
            category.textContent =
                contractor.category || "";

            // PHONE

            const phone = document.createElement("p");
            phone.textContent =
                "📞 " + (contractor.phone || "");

            // STATUS

            const status = document.createElement("span");

            status.className = "work-status " +
                (contractor.status || "available")
                    .toLowerCase()
                    .replace(" ", "-");

            status.textContent =
                contractor.status || "Available";

            // EDIT BUTTON

            const editButton =
                document.createElement("button");

            editButton.textContent = "Edit";
            editButton.type = "button";
            editButton.disabled = !contractorId;

            editButton.addEventListener("click", function() {
                if (!contractorId) {
                    alert("Contractor ID is missing.");
                    return;
                }

                editingContractorId = contractorId;

                document.getElementById(
                    "newContractorName"
                ).value = contractor.name || "";

                document.getElementById(
                    "newContractorCategory"
                ).value = contractor.category || "";

                document.getElementById(
                    "newContractorPhone"
                ).value = contractor.phone || "";

                document.getElementById(
                    "newContractorStatus"
                ).value = contractor.status || "";

                const submitButton = document.querySelector(
                    "#contractorForm button[type='submit']"
                );

                if (submitButton) {
                    submitButton.textContent =
                        "Update Contractor";
                }

                const message =
                    document.getElementById(
                        "contractorMessage"
                    );

                if (message) {
                    message.textContent =
                        "Editing contractor: " +
                        contractor.name;

                    message.style.color = "blue";
                }

                document.getElementById("contractorForm")
                    ?.scrollIntoView({
                        behavior: "smooth"
                    });
            });

            // DELETE BUTTON

            const deleteButton =
                document.createElement("button");

            deleteButton.textContent = "Delete";
            deleteButton.type = "button";
            deleteButton.disabled = !contractorId;

            deleteButton.addEventListener(
                "click",
                async function() {
                    if (!contractorId) {
                        alert("Contractor ID is missing.");
                        return;
                    }

                    const confirmDelete = confirm(
                        "Are you sure you want to delete " +
                        contractor.name + "?"
                    );

                    if (!confirmDelete) return;

                    try {
                        const response = await fetch(
                            `${CONTRACTOR_API}/${encodeURIComponent(contractorId)}`,
                            {
                                method: "DELETE",
                                credentials: "same-origin",
                                headers: {
                                    "Accept": "application/json"
                                }
                            }
                        );

                        const result =
                            await getResponseData(response);

                        if (!response.ok) {
                            throw new Error(
                                result.error ||
                                "Contractor delete failed"
                            );
                        }

                        alert(
                            "Contractor deleted successfully!"
                        );

                        await loadContractors();

                    } catch (error) {
                        console.error(
                            "Delete contractor error:",
                            error
                        );

                        alert(error.message);
                    }
                }
            );

            card.append(
                name,
                category,
                phone,
                status,
                editButton,
                deleteButton
            );

            container.appendChild(card);
        });

        filterContractors();

    } catch (error) {
        console.error(
            "Load contractors error:",
            error
        );

        container.textContent =
            "Unable to load contractors.";
    }
}

// =====================================
// ADD AND UPDATE CONTRACTOR
// =====================================

const contractorForm =
    document.getElementById("contractorForm");

if (contractorForm) {
    contractorForm.addEventListener(
        "submit",
        async function(e) {
            e.preventDefault();

            const contractor = {
                name: document.getElementById(
                    "newContractorName"
                ).value.trim(),

                category: document.getElementById(
                    "newContractorCategory"
                ).value,

                phone: document.getElementById(
                    "newContractorPhone"
                ).value.trim(),

                status: document.getElementById(
                    "newContractorStatus"
                ).value
            };

            const message =
                document.getElementById(
                    "contractorMessage"
                );

            const isEditing =
                editingContractorId !== null;

            const url = isEditing
                ? `${CONTRACTOR_API}/${encodeURIComponent(editingContractorId)}`
                : CONTRACTOR_API;

            try {
                const response = await fetch(url, {
                    method: isEditing ? "PUT" : "POST",

                    credentials: "same-origin",

                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },

                    body: JSON.stringify(contractor)
                });

                const result =
                    await getResponseData(response);

                if (!response.ok) {
                    throw new Error(
                        result.error || "Operation failed"
                    );
                }

                if (message) {
                    message.textContent = isEditing
                        ? "Contractor updated successfully!"
                        : "Contractor added successfully!";

                    message.style.color = "green";
                }

                editingContractorId = null;

                contractorForm.reset();

                const submitButton =
                    document.querySelector(
                        "#contractorForm button[type='submit']"
                    );

                if (submitButton) {
                    submitButton.textContent =
                        "Add Contractor";
                }

                await loadContractors();

            } catch (error) {
                if (message) {
                    message.textContent = error.message;
                    message.style.color = "red";
                }

                console.error(
                    "Contractor operation error:",
                    error
                );
            }
        }
    );
}

// =====================================
// CONTRACTOR SEARCH EVENTS
// =====================================

const contractorSearch =
    document.getElementById("contractorSearch");

const contractorFilter =
    document.getElementById("contractorFilter");

if (contractorSearch) {
    contractorSearch.addEventListener(
        "input",
        filterContractors
    );
}

if (contractorFilter) {
    contractorFilter.addEventListener(
        "change",
        filterContractors
    );
}

// =====================================
// INITIAL LOAD
// =====================================

loadComplaints();
loadProfile();
loadContractors();