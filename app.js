let supabaseClient = null;
let licensesData = [];
let blacklistData = [];
let alertsData = [];
let pendingActivationsData = [];
let activityLogsData = [];
let notifiedAlertIds = new Set(); // To prevent repeating alerts that were already shown in popups
let activeTab = "overview"; // Default tab is now the Overview Dashboard
let refreshIntervalId = null;

// New state variables for advanced activity logging
let selectedActivityEmployee = null; // null means "Barcha xodimlar"
let activitySearchQuery = "";
let employeeSearchQuery = "";

// Chart instances for smooth dynamic updates
let trendChartInstance = null;
let opsChartInstance = null;

// Check if credentials are set
function initSupabase() {
    if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_") ||
        SUPABASE_URL.includes("PLACEHOLDER") || SUPABASE_ANON_KEY.includes("PLACEHOLDER") ||
        !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        Swal.fire({
            icon: 'warning',
            title: 'Supabase Sozlanmagan!',
            text: 'Iltimos, GitHub repository Secrets bo\'limida SUPABASE_URL va SUPABASE_ANON_KEY qiymatlarini kiritganingizni va build muvaffaqiyatli yakunlanganini tekshiring.',
            confirmButtonText: 'Tushundim'
        });
        return false;
    }
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Ulanish Xatosi',
            text: 'Supabase-ga ulanish yaratib bo\'lmadi: ' + err.message,
            confirmButtonText: 'Tushundim'
        });
        return false;
    }
}

// DOM Elements
const loginScreen = document.getElementById("loginScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const logoutBtn = document.getElementById("logoutBtn");

const statTotal = document.getElementById("statTotal");
const statActive = document.getElementById("statActive");
const statExpired = document.getElementById("statExpired");
const searchInput = document.getElementById("searchInput");
const addLicenseBtn = document.getElementById("addLicenseBtn");
const tableBody = document.getElementById("tableBody");
const mobileLicensesContainer = document.getElementById("mobileLicensesContainer");
const pendingActivationsContainer = document.getElementById("pendingActivationsContainer");

const licenseModal = document.getElementById("licenseModal");
const licenseForm = document.getElementById("licenseForm");
const licenseId = document.getElementById("licenseId");
const employeeName = document.getElementById("employeeName");
const deviceId = document.getElementById("deviceId");
const expiresAt = document.getElementById("expiresAt");
const modalTitle = document.getElementById("modalTitle");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");

// Tabs DOM
const tabOverviewBtn = document.getElementById("tabOverviewBtn");
const tabLicensesBtn = document.getElementById("tabLicensesBtn");
const tabBlacklistBtn = document.getElementById("tabBlacklistBtn");
const tabActivityBtn = document.getElementById("tabActivityBtn");
const tabAlertsBtn = document.getElementById("tabAlertsBtn");

const overviewView = document.getElementById("overviewView");
const licensesView = document.getElementById("licensesView");
const blacklistView = document.getElementById("blacklistView");
const activityView = document.getElementById("activityView");
const alertsView = document.getElementById("alertsView");

const alertsBadge = document.getElementById("alertsBadge");
const alertsCountBadge = document.getElementById("alertsCountBadge");
const alertsContainer = document.getElementById("alertsContainer");
const blacklistContainer = document.getElementById("blacklistContainer");

// Overview specific DOM elements
const overviewTotal = document.getElementById("overviewTotal");
const overviewActive = document.getElementById("overviewActive");
const overviewExpired = document.getElementById("overviewExpired");
const overviewAlertsCount = document.getElementById("overviewAlertsCount");
const overviewAlertsFeed = document.getElementById("overviewAlertsFeed");
const overviewActivityFeed = document.getElementById("overviewActivityFeed");

// Activity Logs specific DOM elements
const activitiesContainer = document.getElementById("activitiesContainer");
const activityEmployeeList = document.getElementById("activityEmployeeList");
const employeeActivitySearch = document.getElementById("employeeActivitySearch");
const activityLogsSearch = document.getElementById("activityLogsSearch");
const selectedEmployeeNameHeader = document.getElementById("selectedEmployeeNameHeader");
const selectedEmployeeSubHeader = document.getElementById("selectedEmployeeSubHeader");

const addBlacklistBtn = document.getElementById("addBlacklistBtn");
const clearAllAlertsBtn = document.getElementById("clearAllAlertsBtn");
const clearAllActivitiesBtn = document.getElementById("clearAllActivitiesBtn");
const sqlSetupNotice = document.getElementById("sqlSetupNotice");

// CSV Exporters DOM
const exportLicensesCsvBtn = document.getElementById("exportLicensesCsvBtn");
const exportActivitiesCsvBtn = document.getElementById("exportActivitiesCsvBtn");

// Initialization
document.addEventListener("DOMContentLoaded", () => {
    if (!initSupabase()) return;

    // Session check
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        handleSession(session);
    });

    // Auth change listener
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });

    // Set up Tabs switching
    tabOverviewBtn.addEventListener("click", () => switchTab("overview"));
    tabLicensesBtn.addEventListener("click", () => switchTab("licenses"));
    tabBlacklistBtn.addEventListener("click", () => switchTab("blacklist"));
    tabActivityBtn.addEventListener("click", () => switchTab("activity"));
    tabAlertsBtn.addEventListener("click", () => switchTab("alerts"));
    
    clearAllAlertsBtn.addEventListener("click", clearAllAlerts);
    clearAllActivitiesBtn.addEventListener("click", clearAllActivities);
    addBlacklistBtn.addEventListener("click", promptAddBlacklist);

    // Search and filter listeners for Activity Tab
    employeeActivitySearch.addEventListener("input", (e) => {
        employeeSearchQuery = e.target.value.toLowerCase().trim();
        renderActivityEmployeeList();
    });

    activityLogsSearch.addEventListener("input", (e) => {
        activitySearchQuery = e.target.value.toLowerCase().trim();
        renderActivityLogs(activityLogsData);
    });

    // CSV Exporters listeners
    exportLicensesCsvBtn.addEventListener("click", exportLicensesCsv);
    exportActivitiesCsvBtn.addEventListener("click", exportActivitiesCsv);
});

function handleSession(session) {
    if (session) {
        loginScreen.classList.add("hidden");
        dashboardScreen.classList.remove("hidden");
        
        // Initial silent loading to populate all state lists first
        fetchLicenses();
        fetchBlacklist();
        fetchAlerts();
        fetchPendingActivations();
        fetchActivityLogs();

        // Switch to default overview tab
        switchTab("overview");

        // Real-time automatic check every 10 seconds
        if (!refreshIntervalId) {
            refreshIntervalId = setInterval(() => {
                fetchLicenses();
                fetchBlacklist(true);
                fetchAlerts(true);
                fetchPendingActivations(true);
                fetchActivityLogs(true);
            }, 10000);
        }
    } else {
        loginScreen.classList.remove("hidden");
        dashboardScreen.classList.add("hidden");
        tableBody.innerHTML = "";
        mobileLicensesContainer.innerHTML = "";
        alertsContainer.innerHTML = "";
        blacklistContainer.innerHTML = "";
        pendingActivationsContainer.innerHTML = "";
        activitiesContainer.innerHTML = "";
        activityEmployeeList.innerHTML = "";
        overviewAlertsFeed.innerHTML = "";
        overviewActivityFeed.innerHTML = "";
        
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
            refreshIntervalId = null;
        }
    }
}

// Tab Switch
function switchTab(tab) {
    activeTab = tab;
    // Clear current tabs classes to inactive capsule style
    const inactiveClass = "py-1.5 px-4 rounded-full text-xs font-semibold focus:outline-none flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-900/50";
    tabOverviewBtn.className = inactiveClass;
    tabLicensesBtn.className = inactiveClass;
    tabBlacklistBtn.className = inactiveClass;
    tabActivityBtn.className = inactiveClass;
    tabAlertsBtn.className = "py-1.5 px-4 rounded-full text-xs font-semibold focus:outline-none flex items-center gap-1.5 relative whitespace-nowrap transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-900/50";
    
    overviewView.classList.add("hidden");
    licensesView.classList.add("hidden");
    blacklistView.classList.add("hidden");
    activityView.classList.add("hidden");
    alertsView.classList.add("hidden");

    const activeClass = "py-1.5 px-4 rounded-full text-xs font-semibold focus:outline-none flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 bg-indigo-600 text-white shadow-md shadow-indigo-500/20";

    if (tab === "overview") {
        tabOverviewBtn.className = activeClass;
        overviewView.classList.remove("hidden");
        updateOverviewDashboard();
    } else if (tab === "licenses") {
        tabLicensesBtn.className = activeClass;
        licensesView.classList.remove("hidden");
        fetchPendingActivations(false, true);
        fetchLicenses(true);
    } else if (tab === "blacklist") {
        tabBlacklistBtn.className = activeClass;
        blacklistView.classList.remove("hidden");
        fetchBlacklist(false, true);
    } else if (tab === "activity") {
        tabActivityBtn.className = activeClass;
        activityView.classList.remove("hidden");
        fetchActivityLogs(false, true);
    } else {
        tabAlertsBtn.className = "py-1.5 px-4 rounded-full text-xs font-semibold focus:outline-none flex items-center gap-1.5 relative whitespace-nowrap transition-all duration-200 bg-indigo-600 text-white shadow-md shadow-indigo-500/20";
        alertsView.classList.remove("hidden");
        fetchAlerts(false, true);
    }
}

// Login Handler
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    Swal.fire({
        title: 'Kirilmoqda...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            Swal.fire({ icon: 'error', title: 'Kirish taqiqlandi', text: error.message });
        } else {
            Swal.close();
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Tizim xatosi', text: err.message || err });
    }
});

// Logout Handler
logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
});

// Fetch Licenses Data
async function fetchLicenses(force = false) {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Litsenziya yuklashda xato:", error);
        return;
    }

    const newData = data || [];
    const hasChanged = JSON.stringify(newData) !== JSON.stringify(licensesData);
    
    if (hasChanged || force) {
        licensesData = newData;
        renderLicenses(licensesData);
        updateStats(licensesData);
        
        if (activeTab === "overview") {
            updateOverviewDashboard();
        } else if (activeTab === "activity") {
            renderActivityEmployeeList();
        }
    } else {
        updateStats(licensesData);
        updateOnlineStatuses();
    }
}

// Update Dashboard Overview Counts, feeds and charts
function updateOverviewDashboard() {
    // 1. Total counts
    const overviewTotal = document.getElementById("overviewTotal");
    const overviewTotalDisplay = document.getElementById("overviewTotalDisplay");
    if (overviewTotal) overviewTotal.innerText = licensesData.length;
    if (overviewTotalDisplay) overviewTotalDisplay.innerText = licensesData.length;

    const overviewAlertsCount = document.getElementById("overviewAlertsCount");
    const overviewAlertsCountBadge = document.getElementById("overviewAlertsCountBadge");
    if (overviewAlertsCount) overviewAlertsCount.innerText = alertsData.length;
    if (overviewAlertsCountBadge) overviewAlertsCountBadge.innerText = `${alertsData.length} Tahdid`;

    // Active devices logic
    const activeCount = licensesData.filter(item => {
        let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
        const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
        if (latestLog) {
            const logTime = new Date(latestLog.created_at);
            if (!lastSeen || logTime > lastSeen) lastSeen = logTime;
        }
        return lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;
    }).length;
    
    const overviewActive = document.getElementById("overviewActive");
    const overviewActiveDisplay = document.getElementById("overviewActiveDisplay");
    if (overviewActive) overviewActive.innerText = activeCount;
    if (overviewActiveDisplay) overviewActiveDisplay.innerText = activeCount;

    const expiredCount = licensesData.filter(item => new Date(item.expires_at) <= new Date()).length;
    const overviewExpired = document.getElementById("overviewExpired");
    const overviewExpiredDisplay = document.getElementById("overviewExpiredDisplay");
    if (overviewExpired) overviewExpired.innerText = expiredCount;
    if (overviewExpiredDisplay) overviewExpiredDisplay.innerText = expiredCount;

    // Vault status card - dynamic threats count
    const vaultAlertsCount = document.getElementById("vaultAlertsCount");
    if (vaultAlertsCount) {
        if (alertsData.length === 0) {
            vaultAlertsCount.innerText = "Xavfsiz";
            vaultAlertsCount.className = "font-bold text-emerald-400";
        } else {
            vaultAlertsCount.innerText = `${alertsData.length} ta tahdid`;
            vaultAlertsCount.className = "font-bold text-red-400 animate-pulse";
        }
    }

    // Credit Card display update
    const ccEmployeeName = document.getElementById("ccEmployeeName");
    const ccDeviceId = document.getElementById("ccDeviceId");
    const ccExpiresOn = document.getElementById("ccExpiresOn");
    const ccStatusBadge = document.getElementById("ccStatusBadge");

    if (ccEmployeeName && ccDeviceId && ccExpiresOn && ccStatusBadge) {
        const selectedEmp = licensesData[0] || {
            employee_name: "Xodim yo'q",
            device_id: "Noma'lum qurilma",
            expires_at: new Date().toISOString(),
            is_active: false
        };

        ccEmployeeName.innerText = selectedEmp.employee_name;
        ccDeviceId.innerText = selectedEmp.device_id;
        ccExpiresOn.innerText = new Date(selectedEmp.expires_at).toLocaleDateString("uz-UZ", {
            month: '2-digit',
            year: 'numeric'
        });
        
        ccStatusBadge.innerText = selectedEmp.is_active ? "Faol" : "Bloklangan";
        ccStatusBadge.className = selectedEmp.is_active
            ? "inline-block mt-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-medium"
            : "inline-block mt-1 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-md font-medium";
    }

    // Mini Employee list update
    const miniEmployeesList = document.getElementById("miniEmployeesList");
    const miniEmployeesCount = document.getElementById("miniEmployeesCount");
    if (miniEmployeesList && miniEmployeesCount) {
        miniEmployeesCount.innerText = `${activityLogsData.length} logs`;
        miniEmployeesList.innerHTML = "";
        
        if (licensesData.length === 0) {
            miniEmployeesList.innerHTML = `
                <div class="text-center py-4 text-slate-500 text-[10px]">
                    Xodimlar mavjud emas.
                </div>
            `;
        } else {
            licensesData.slice(0, 4).forEach(item => {
                let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
                const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
                if (latestLog) {
                    const logTime = new Date(latestLog.created_at);
                    if (!lastSeen || logTime > lastSeen) lastSeen = logTime;
                }
                const isOnline = lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;
                const countLogs = activityLogsData.filter(log => log.device_id === item.device_id).length;

                const div = document.createElement("div");
                div.className = "flex justify-between items-center text-xs p-1.5 hover:bg-slate-800/20 rounded-lg transition-all duration-200";
                div.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0">
                        ${isOnline 
                            ? '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse flex-shrink-0"></span>' 
                            : '<span class="w-1.5 h-1.5 bg-slate-600 rounded-full flex-shrink-0"></span>'}
                        <span class="text-slate-200 font-semibold truncate">${escapeHtml(item.employee_name)}</span>
                    </div>
                    <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono flex-shrink-0">${countLogs} logs</span>
                `;
                miniEmployeesList.appendChild(div);
            });
        }
    }

    // 2. Render mini alerts feed
    renderOverviewAlertsFeed();

    // 3. Render mini activity feed
    renderOverviewActivityFeed();

    // 4. Render charts
    renderOverviewCharts();
}

// Render 4 most recent threats in overview page
function renderOverviewAlertsFeed() {
    overviewAlertsFeed.innerHTML = "";
    const recentAlerts = alertsData.slice(0, 4);

    if (recentAlerts.length === 0) {
        overviewAlertsFeed.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                <i class="fa-solid fa-shield-check text-xl mb-1.5 text-emerald-500 block"></i>
                Hech qanday ogohlantirish yo'q. Tizim tinch.
            </div>
        `;
        return;
    }

    recentAlerts.forEach(alert => {
        const timeString = new Date(alert.created_at).toLocaleTimeString("uz-UZ", { hour: '2-digit', minute: '2-digit' });
        
        let typeBadge = "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
        if (alert.alert_type === "DEBUGGER_DETECTION" || alert.alert_type === "SECURITY_BYPASS_ATTEMPT") {
            typeBadge = "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse";
        }

        const div = document.createElement("div");
        div.className = "p-3 glass-card flex justify-between items-center gap-3 border border-red-500/10";
        div.innerHTML = `
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-white">${escapeHtml(alert.employee_name || 'Noma\'lum')}</span>
                    <span class="text-[8px] px-1.5 py-0.5 rounded ${typeBadge}">${alert.alert_type}</span>
                </div>
                <p class="text-[10px] text-slate-400 truncate mt-1">${escapeHtml(alert.details)}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-[10px] text-slate-500 font-mono">${timeString}</span>
                <button onclick="deleteAlert('${alert.id}')" class="text-[10px] text-slate-400 hover:text-white bg-slate-800 p-1 rounded" title="O'chirish">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        `;
        overviewAlertsFeed.appendChild(div);
    });
}

// Render 5 most recent activities in overview page
function renderOverviewActivityFeed() {
    overviewActivityFeed.innerHTML = "";
    const recentActivities = activityLogsData.slice(0, 5);

    if (recentActivities.length === 0) {
        overviewActivityFeed.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                <i class="fa-solid fa-circle-notch text-xl mb-1.5 block"></i>
                Faoliyat jurnali bo'sh.
            </div>
        `;
        return;
    }

    recentActivities.forEach(log => {
        const timeString = new Date(log.created_at).toLocaleTimeString("uz-UZ", { hour: '2-digit', minute: '2-digit' });
        
        let iconClass = "fa-solid fa-circle-notch text-slate-500";
        if (log.activity_type === "VAULT_FILE_READ") iconClass = "fa-solid fa-file-export text-blue-400";
        else if (log.activity_type === "VAULT_FILE_WRITE") iconClass = "fa-solid fa-file-import text-emerald-400";
        else if (log.activity_type === "LOCAL_FILE_WRITE") iconClass = "fa-solid fa-pen-nib text-orange-400";

        const div = document.createElement("div");
        div.className = "p-2.5 glass-card flex justify-between items-center gap-3 border border-slate-800/40";
        div.innerHTML = `
            <div class="min-w-0 flex items-center gap-2.5">
                <span class="text-xs flex-shrink-0"><i class="${iconClass}"></i></span>
                <div class="min-w-0">
                    <h5 class="text-xs font-semibold text-slate-200 truncate">${escapeHtml(log.employee_name || 'Noma\'lum')}</h5>
                    <p class="text-[10px] text-slate-400 truncate">${escapeHtml(log.details)}</p>
                </div>
            </div>
            <span class="text-[10px] text-slate-500 font-mono flex-shrink-0">${timeString}</span>
        `;
        overviewActivityFeed.appendChild(div);
    });
}

// Render dynamic ApexCharts visual diagrams
function renderOverviewCharts() {
    // ---- CHART 1: Activity Trend (7 Days Line Graph) ----
    const trendData = getActivityTrendData(activityLogsData);

    const trendOptions = {
        series: [{
            name: "Jurnallar soni",
            data: trendData.counts
        }],
        chart: {
            type: 'area',
            height: 140,
            foreColor: '#94a3b8',
            toolbar: { show: false },
            background: 'transparent',
            sparkline: { enabled: true }
        },
        colors: ['#6366f1'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2.5 },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.35,
                opacityTo: 0.02,
                stops: [0, 90, 100]
            }
        },
        xaxis: {
            categories: trendData.dates,
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            tickAmount: 4,
            labels: {
                formatter: function (val) { return Math.round(val); }
            }
        },
        grid: {
            borderColor: '#1e293b',
            strokeDashArray: 4,
            yaxis: { lines: { show: false } },
            xaxis: { lines: { show: false } }
        },
        tooltip: { theme: 'dark' }
    };

    if (trendChartInstance) {
        trendChartInstance.updateSeries([{ data: trendData.counts }]);
        trendChartInstance.updateOptions({ xaxis: { categories: trendData.dates } });
    } else {
        trendChartInstance = new ApexCharts(document.querySelector("#activityTrendChart"), trendOptions);
        trendChartInstance.render();
    }

    // ---- CHART 2: File Operations breakdown (Donut Graph) ----
    const opsData = getFileOperationsData(activityLogsData);

    const opsOptions = {
        series: opsData,
        chart: {
            type: 'donut',
            height: 160,
            foreColor: '#94a3b8',
            background: 'transparent'
        },
        labels: ["Vault o'qish", "Vault yozish", "Mahalliy chizma"],
        colors: ['#6366f1', '#10b981', '#f97316'],
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Jami',
                            color: '#ffffff',
                            fontSize: '11px',
                            formatter: function (w) {
                                return w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                            }
                        }
                    }
                }
            }
        },
        stroke: { show: false },
        legend: {
            show: false
        },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' }
    };

    if (opsChartInstance) {
        opsChartInstance.updateSeries(opsData);
    } else {
        document.querySelector("#fileOperationsChart").innerHTML = "";
        opsChartInstance = new ApexCharts(document.querySelector("#fileOperationsChart"), opsOptions);
        opsChartInstance.render();
    }
}

// Helper: Group log items count by the last 7 calendar days
function getActivityTrendData(logs) {
    const dates = [];
    const counts = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString("uz-UZ", { month: 'short', day: 'numeric' });
        dates.push(dateStr);
        
        const count = logs.filter(log => {
            const logDate = new Date(log.created_at);
            return logDate.getDate() === d.getDate() &&
                   logDate.getMonth() === d.getMonth() &&
                   logDate.getFullYear() === d.getFullYear();
        }).length;
        counts.push(count);
    }
    
    return { dates, counts };
}

// Helper: Group file operations counts for donut slices
function getFileOperationsData(logs) {
    const readCount = logs.filter(log => log.activity_type === "VAULT_FILE_READ").length;
    const writeCount = logs.filter(log => log.activity_type === "VAULT_FILE_WRITE").length;
    const localCount = logs.filter(log => log.activity_type === "LOCAL_FILE_WRITE").length;
    return [readCount, writeCount, localCount];
}

// CSV exporter utilities
function exportToCsv(filename, headers, rows) {
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(",")].concat(rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Action: Export all licenses to CSV format
function exportLicensesCsv() {
    if (licensesData.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Eksport taqiqlandi', text: 'Eksport qilish uchun litsenziyalar ro\'yxati bo\'sh.' });
        return;
    }
    const headers = ["Xodim Ismi", "Device ID", "Tugash Muddati", "Faollik Holati", "Yaratilgan Sana"];
    const rows = licensesData.map(item => [
        item.employee_name,
        item.device_id,
        new Date(item.expires_at).toLocaleString("uz-UZ"),
        item.is_active ? "FAOL" : "BLOKLANGAN",
        new Date(item.created_at).toLocaleString("uz-UZ")
    ]);
    exportToCsv(`Licenses_Report_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

// Action: Export filtered activity logs to CSV format
function exportActivitiesCsv() {
    let filtered = selectedActivityEmployee 
        ? activityLogsData.filter(log => log.employee_name === selectedActivityEmployee) 
        : activityLogsData;

    if (activitySearchQuery) {
        filtered = filtered.filter(log => 
            (log.details && log.details.toLowerCase().includes(activitySearchQuery)) ||
            (log.pc_name && log.pc_name.toLowerCase().includes(activitySearchQuery))
        );
    }

    if (filtered.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Eksport taqiqlandi', text: 'Filter bo\'yicha hech qanday faoliyat jurnali topilmadi.' });
        return;
    }

    const headers = ["Sana/Vaqt", "Xodim Ismi", "Amal turi", "Batafsil ma'lumot", "Komp Nomi", "Komp User", "Device ID"];
    const rows = filtered.map(log => [
        new Date(log.created_at).toLocaleString("uz-UZ"),
        log.employee_name || 'Noma\'lum',
        log.activity_type,
        log.details || '',
        log.pc_name || 'Noma\'lum',
        log.pc_user || 'Noma\'lum',
        log.device_id
    ]);
    
    const label = selectedActivityEmployee ? selectedActivityEmployee : "Barcha_Xodimlar";
    exportToCsv(`Activity_Logs_${label}_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

// Render Employee list in the sidebar of Activity Logs
function renderActivityEmployeeList() {
    activityEmployeeList.innerHTML = "";

    // Card 1: All Employees option
    const allCard = document.createElement("div");
    allCard.className = `sidebar-item p-3 glass-card flex items-center justify-between cursor-pointer border ${selectedActivityEmployee === null ? 'sidebar-item-active' : 'border-slate-800/40'}`;
    allCard.innerHTML = `
        <div class="flex items-center gap-2.5">
            <span class="employee-icon text-slate-400 text-sm"><i class="fa-solid fa-users"></i></span>
            <span class="text-xs font-semibold">Barcha xodimlar</span>
        </div>
        <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">${activityLogsData.length} logs</span>
    `;
    allCard.addEventListener("click", () => selectEmployeeForActivity(null));
    activityEmployeeList.appendChild(allCard);

    // Filter licenses list based on search bar
    const filteredLicenses = licensesData.filter(item => 
        item.employee_name.toLowerCase().includes(employeeSearchQuery)
    );

    // Render each employee card
    filteredLicenses.forEach(item => {
        // Check online status
        let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
        const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
        if (latestLog) {
            const logTime = new Date(latestLog.created_at);
            if (!lastSeen || logTime > lastSeen) {
                lastSeen = logTime;
            }
        }
        const isOnline = lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;
        const countLogs = activityLogsData.filter(log => log.device_id === item.device_id).length;

        const card = document.createElement("div");
        card.className = `sidebar-item p-3 glass-card flex items-center justify-between cursor-pointer border ${selectedActivityEmployee === item.employee_name ? 'sidebar-item-active' : 'border-slate-800/40'}`;
        card.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="employee-icon text-slate-400 text-sm flex-shrink-0">
                    <i class="fa-solid fa-user"></i>
                </span>
                <div class="min-w-0">
                    <h4 class="text-xs font-semibold truncate text-slate-200">${escapeHtml(item.employee_name)}</h4>
                    <p class="text-[9px] text-slate-400 truncate font-mono">${truncateString(item.device_id, 12)}</p>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                ${isOnline 
                    ? `<span data-sidebar-device-id="${item.device_id}" data-online="true" class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" title="Tarmoqda"></span>` 
                    : `<span data-sidebar-device-id="${item.device_id}" data-online="false" class="w-2 h-2 bg-slate-600 rounded-full" title="Oflayn"></span>`}
                <span class="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-mono">${countLogs}</span>
            </div>
        `;
        card.addEventListener("click", () => selectEmployeeForActivity(item));
        activityEmployeeList.appendChild(card);
    });
}

// Select employee inside the sidebar of activity logs
function selectEmployeeForActivity(employee) {
    if (employee === null) {
        selectedActivityEmployee = null;
        selectedEmployeeNameHeader.innerText = "Barcha xodimlar";
        selectedEmployeeSubHeader.innerHTML = "Barcha qurilmalarning faoliyat jurnali";
    } else {
        selectedActivityEmployee = employee.employee_name;
        selectedEmployeeNameHeader.innerText = employee.employee_name;
        selectedEmployeeSubHeader.innerHTML = `
            <div class="flex items-center gap-1.5 flex-wrap">
                <span>Device ID:</span>
                <span class="font-mono text-[11px] bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded text-slate-300 hover:text-blue-400 cursor-pointer flex items-center gap-1" onclick="copyToClipboard('${employee.device_id}')" title="Nusxalash">
                    ${truncateString(employee.device_id, 24)}
                    <i class="fa-solid fa-copy text-[10px] text-slate-500"></i>
                </span>
            </div>
        `;
    }
    
    // Highlight list item immediately
    renderActivityEmployeeList();
    // Render filtered activity logs
    renderActivityLogs(activityLogsData);
}

// Fetch Pending Activations Data
async function fetchPendingActivations(silent = false, force = false) {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from("pending_activations")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Pending activations error:", error);
        return;
    }

    const newData = data || [];
    const hasChanged = JSON.stringify(newData) !== JSON.stringify(pendingActivationsData);
    if (hasChanged || force) {
        pendingActivationsData = newData;
        renderPendingActivations(pendingActivationsData);
    }
}

// Render Pending Activations Banner Cards
function renderPendingActivations(data) {
    pendingActivationsContainer.innerHTML = "";

    if (data.length === 0) {
        pendingActivationsContainer.classList.add("hidden");
        return;
    }

    pendingActivationsContainer.classList.remove("hidden");

    // Add Header
    const header = document.createElement("div");
    header.className = "flex items-center gap-2 text-yellow-500 font-bold text-xs md:text-sm mb-3 animate-pulse";
    header.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <span>Kutilayotgan Faollashtirishlar (${data.length} ta)</span>`;
    pendingActivationsContainer.appendChild(header);

    data.forEach(item => {
        const dateString = new Date(item.expires_at).toLocaleString("uz-UZ", {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        const card = document.createElement("div");
        card.className = "glass-card p-4 border border-yellow-500/30 bg-yellow-500/5 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in mb-2";
        card.innerHTML = `
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <h4 class="font-bold text-white text-xs md:text-sm">${escapeHtml(item.employee_name)}</h4>
                    <span class="text-[9px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full font-semibold">Tasdiqlash kutilmoqda</span>
                </div>
                <p class="text-[10px] md:text-xs text-slate-400 font-mono flex items-center gap-1 cursor-pointer hover:text-blue-400" onclick="copyToClipboard('${item.device_id}')">
                    <strong>Device ID:</strong> ${truncateString(item.device_id, 24)} <i class="fa-solid fa-copy text-[8px]"></i>
                </p>
                <p class="text-[10px] md:text-xs text-slate-400">
                    <strong>Taklif etilgan muddat:</strong> <span class="text-slate-300 font-medium">${dateString}</span>
                </p>
            </div>
            
            <div class="flex gap-2">
                <button onclick="approveActivation('${item.id}', '${item.device_id}', '${escapeHtml(item.employee_name)}', '${item.expires_at}')" class="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
                    <i class="fa-solid fa-check"></i> Ruxsat berish
                </button>
                <button onclick="rejectActivation('${item.id}')" class="py-1.5 px-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
                    <i class="fa-solid fa-xmark"></i> Rad etish
                </button>
            </div>
        `;
        pendingActivationsContainer.appendChild(card);
    });
}

// Approve Activation Action
window.approveActivation = async function(id, deviceId, employeeName, expiresAt) {
    Swal.fire({ title: 'Tasdiqlanmoqda...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // 1. Delete from blacklist if exists
    await supabaseClient.from("blacklist").delete().eq("device_id", deviceId);

    // 2. Check if device exists in licenses
    const { data: existingLicense } = await supabaseClient
        .from("licenses")
        .select("id")
        .eq("device_id", deviceId);

    let error = null;
    if (existingLicense && existingLicense.length > 0) {
        // Update
        const { error: err } = await supabaseClient
            .from("licenses")
            .update({ employee_name: employeeName, expires_at: expiresAt, is_active: true, updated_at: new Date().toISOString() })
            .eq("device_id", deviceId);
        error = err;
    } else {
        // Insert
        const { error: err } = await supabaseClient
            .from("licenses")
            .insert([{ employee_name: employeeName, device_id: deviceId, expires_at: expiresAt, is_active: true }]);
        error = err;
    }

    if (error) {
        Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        return;
    }

    // 3. Delete request from pending_activations
    await supabaseClient.from("pending_activations").delete().eq("id", id);

    // 4. Dismiss security alert for unauthorized device
    await supabaseClient.from("security_alerts").delete().eq("device_id", deviceId);

    Swal.fire({ icon: 'success', title: 'Litsenziya faollashtirildi!', timer: 1500, showConfirmButton: false });
    fetchLicenses();
    fetchPendingActivations();
    fetchAlerts();
};

// Reject Activation Action
window.rejectActivation = async function(id) {
    const result = await Swal.fire({
        title: 'Rad etilsinmi?',
        text: 'Faollashtirish so\'rovi paneldan o\'chirib tashlanadi.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ha, rad etish',
        cancelButtonText: 'Bekor qilish'
    });

    if (result.isConfirmed) {
        const { error } = await supabaseClient
            .from("pending_activations")
            .delete().eq("id", id);

        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'Rad etildi!', timer: 1500, showConfirmButton: false });
            fetchPendingActivations();
        }
    }
};

// Fetch Activity Logs
async function fetchActivityLogs(silent = false, force = false) {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200); // Expanded limit to give a broader logs view

    if (error) {
        console.error("Activity logs error:", error);
        return;
    }

    const newData = data || [];
    const hasChanged = JSON.stringify(newData) !== JSON.stringify(activityLogsData);
    if (hasChanged || force) {
        activityLogsData = newData;
        
        if (activeTab === "overview") {
            updateOverviewDashboard();
        } else if (activeTab === "activity") {
            renderActivityLogs(activityLogsData);
            renderActivityEmployeeList(); // Refresh employee logs count badges
        }
    } else {
        updateStats(licensesData);
        updateOnlineStatuses();
    }
}

// Render Activity Logs Timeline (Filtered by Selected Employee and Search Input)
function renderActivityLogs(data) {
    activitiesContainer.innerHTML = "";

    // 1. Filter by Selected Employee
    let filtered = selectedActivityEmployee 
        ? data.filter(log => log.employee_name === selectedActivityEmployee) 
        : data;

    // 2. Filter by Search Query (Searching in details or pc names)
    if (activitySearchQuery) {
        filtered = filtered.filter(log => 
            (log.details && log.details.toLowerCase().includes(activitySearchQuery)) ||
            (log.pc_name && log.pc_name.toLowerCase().includes(activitySearchQuery)) ||
            (log.pc_user && log.pc_user.toLowerCase().includes(activitySearchQuery))
        );
    }

    if (filtered.length === 0) {
        activitiesContainer.innerHTML = `
            <div class="text-center p-8 text-slate-500 my-auto w-full">
                <i class="fa-solid fa-clock text-3xl mb-2 block"></i>
                Mos keluvchi faoliyat jurnallari topilmadi.
            </div>
        `;
        return;
    }

    filtered.forEach(log => {
        const timeString = new Date(log.created_at).toLocaleString("uz-UZ", {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        let iconClass = "fa-solid fa-circle-notch text-slate-400";
        let badgeColor = "bg-slate-500/10 text-slate-400 border-slate-500/20";
        let label = log.activity_type;

        if (log.activity_type === "VAULT_FILE_READ") {
            iconClass = "fa-solid fa-file-export text-blue-400";
            badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
            label = "Vaultdan o'qildi";
        } else if (log.activity_type === "VAULT_FILE_WRITE") {
            iconClass = "fa-solid fa-file-import text-emerald-400";
            badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            label = "Vaultga yozildi";
        } else if (log.activity_type === "LOCAL_FILE_WRITE") {
            iconClass = "fa-solid fa-pen-nib text-orange-400";
            badgeColor = "bg-orange-500/10 text-orange-400 border-orange-500/20";
            label = "Mahalliy chizma";
        } else if (log.activity_type === "THEFT_BLOCK") {
            iconClass = "fa-solid fa-lock text-red-500";
            badgeColor = "bg-red-500/10 text-red-400 border-red-500/20";
            label = "🔒 O'QILDI (Shifrlangan)";
        }

        const item = document.createElement("div");
        item.className = "flex gap-4 items-start border-l border-slate-800 pl-4 relative ml-3 py-1 animate-fade-in";
        item.innerHTML = `
            <div class="absolute -left-[9px] top-2 bg-slate-950 p-0.5 rounded-full border border-slate-800">
                <div class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] bg-slate-900">
                    <i class="${iconClass}"></i>
                </div>
            </div>
            
            <div class="flex-1 space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-white">${escapeHtml(log.employee_name || 'Noma\'lum')}</span>
                        <span class="text-[9px] px-1.5 py-px border rounded-full ${badgeColor}">${label}</span>
                    </div>
                    <span class="text-[10px] text-slate-500 font-mono">${timeString}</span>
                </div>
                
                <p class="text-xs text-slate-300 font-medium">${escapeHtml(log.details || '')}</p>
                <div class="text-[9px] text-slate-500 font-mono flex items-center gap-2">
                    <span>Kompyuter: <strong>${escapeHtml(log.pc_name || 'Noma\'lum')}</strong> (${escapeHtml(log.pc_user || 'Noma\'lum')})</span>
                    <span>•</span>
                    <span>Device ID: ${truncateString(log.device_id, 12)}</span>
                </div>
            </div>
        `;
        activitiesContainer.appendChild(item);
    });
}

// Clear Activity Logs
async function clearAllActivities() {
    if (activityLogsData.length === 0) return;

    const result = await Swal.fire({
        title: 'Faoliyat monitoringi tozalansinmi?',
        text: 'Barcha xodimlarning ish faoliyati tarixi butunlay o\'chiriladi!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ha, tozalash',
        cancelButtonText: 'Bekor qilish'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Tozalanmoqda...', didOpen: () => Swal.showLoading() });
        const { error } = await supabaseClient.from("activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'Tarix tozalandi!', timer: 1500, showConfirmButton: false });
            fetchActivityLogs();
        }
    }
}

// Render Licenses (Responsive Grid & Table)
function renderLicenses(data) {
    tableBody.innerHTML = "";
    mobileLicensesContainer.innerHTML = "";

    if (data.length === 0) {
        const emptyState = `
            <div class="text-center p-8 text-slate-500 w-full glass-card">
                <i class="fa-solid fa-folder-open text-3xl mb-2 block"></i>
                Litsenziyalar topilmadi
            </div>
        `;
        mobileLicensesContainer.innerHTML = emptyState;
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center p-8 text-slate-500">
                    <i class="fa-solid fa-folder-open text-3xl mb-2 block"></i>
                    Ma'lumotlar topilmadi
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(item => {
        const isExpired = new Date(item.expires_at) <= new Date();
        const expiryString = new Date(item.expires_at).toLocaleString("uz-UZ", {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        // Check online status
        let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
        const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
        if (latestLog) {
            const logTime = new Date(latestLog.created_at);
            if (!lastSeen || logTime > lastSeen) {
                lastSeen = logTime;
            }
        }
        
        const isOnline = lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;
        
        const onlineBadge = isOnline 
            ? `<span data-badge-device-id="${item.device_id}" data-online="true" class="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium"><span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Tarmoqda</span>` 
            : `<span data-badge-device-id="${item.device_id}" data-online="false" class="inline-flex items-center gap-1 text-[10px] bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded-full font-medium">Oflayn</span>`;

        // Desktop row creation
        const row = document.createElement("tr");
        row.className = "hover:bg-slate-800/20 transition-all border-b border-slate-800/40";
        row.innerHTML = `
            <td class="p-4 font-medium text-white">
                <div class="flex items-center gap-2">
                    <span>${escapeHtml(item.employee_name)}</span>
                    ${onlineBadge}
                </div>
            </td>
            <td class="p-4 font-mono text-xs text-slate-400 group relative">
                <span class="cursor-pointer hover:text-blue-400" onclick="copyToClipboard('${item.device_id}')" title="Nusxalash">
                    ${truncateString(item.device_id, 24)}
                    <i class="fa-solid fa-copy ml-1 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </span>
            </td>
            <td class="p-4 ${isExpired ? 'text-red-400 font-semibold' : 'text-slate-300'}">
                ${expiryString} ${isExpired ? '<span class="text-xs bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 ml-1">Tugagan</span>' : ''}
            </td>
            <td class="p-4 text-center">
                <div class="inline-flex items-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only toggle-checkbox" ${item.is_active ? 'checked' : ''} onchange="toggleActiveState('${item.id}', this.checked)">
                        <div class="w-11 h-6 bg-slate-800 rounded-full toggle-label transition-colors duration-200 border border-slate-700">
                            <div class="w-4 h-4 bg-white rounded-full toggle-dot absolute left-1 top-1 transition-transform duration-200 shadow-md"></div>
                        </div>
                    </label>
                </div>
            </td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-3">
                    <button onclick="editLicense('${item.id}')" class="text-blue-400 hover:text-blue-300 text-lg transition-all">
                        <i class="fa-solid fa-pen-to-square text-xs md:text-sm"></i>
                    </button>
                    <button onclick="deleteLicense('${item.id}')" class="text-red-400 hover:text-red-300 text-lg transition-all">
                        <i class="fa-solid fa-trash-can text-xs md:text-sm"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);

        // Mobile card creation
        const card = document.createElement("div");
        card.className = "glass-card p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-white flex items-center gap-2">
                        <span>${escapeHtml(item.employee_name)}</span>
                        ${onlineBadge}
                    </h4>
                    <p class="text-[10px] font-mono text-slate-400 mt-1 cursor-pointer flex items-center gap-1" onclick="copyToClipboard('${item.device_id}')">
                        <span>ID: ${truncateString(item.device_id, 12)}</span>
                        <i class="fa-solid fa-copy text-slate-500"></i>
                    </p>
                </div>
                <div class="flex items-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only toggle-checkbox" ${item.is_active ? 'checked' : ''} onchange="toggleActiveState('${item.id}', this.checked)">
                        <div class="w-9 h-5 bg-slate-800 rounded-full toggle-label transition-colors duration-200 border border-slate-700">
                            <div class="w-3.5 h-3.5 bg-white rounded-full toggle-dot absolute left-0.5 top-0.5 transition-transform duration-200 shadow-md"></div>
                        </div>
                    </label>
                </div>
            </div>
            
            <div class="flex justify-between items-center pt-2 border-t border-slate-800/50 text-xs">
                <span class="${isExpired ? 'text-red-400 font-semibold' : 'text-slate-400'}">
                    Muddati: ${expiryString.split(',')[0]}
                </span>
                <div class="flex gap-2">
                    <button onclick="editLicense('${item.id}')" class="py-1 px-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-semibold">
                        Tahrirlash
                    </button>
                    <button onclick="deleteLicense('${item.id}')" class="py-1 px-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-semibold">
                        O'chirish
                    </button>
                </div>
            </div>
        `;
        mobileLicensesContainer.appendChild(card);
    });
}

// Toggle Active State
async function toggleActiveState(id, isChecked) {
    const { error } = await supabaseClient
        .from("licenses")
        .update({ is_active: isChecked, updated_at: new Date().toISOString() })
        .eq("id", id);

    if (error) {
        Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        fetchLicenses();
    } else {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });
        Toast.fire({
            icon: 'success',
            title: isChecked ? 'Ruxsat faollashtirildi' : 'Ruxsat bekor qilindi'
        });
        updateStats(licensesData.map(item => item.id === id ? { ...item, is_active: isChecked } : item));
        fetchLicenses();
    }
}

// Fetch Blacklist Data
async function fetchBlacklist(silent = false, force = false) {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from("blacklist")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Blacklist fetching error:", error);
        return;
    }

    const newData = data || [];
    const hasChanged = JSON.stringify(newData) !== JSON.stringify(blacklistData);
    if (hasChanged || force) {
        blacklistData = newData;
        renderBlacklist(blacklistData);
    }
}

// Render Blacklist
function renderBlacklist(data) {
    blacklistContainer.innerHTML = "";

    if (data.length === 0) {
        blacklistContainer.innerHTML = `
            <div class="col-span-full text-center p-8 text-slate-500 glass-card w-full">
                <i class="fa-solid fa-circle-check text-3xl mb-2 text-emerald-500 block"></i>
                Qora ro'yxat bo'sh. Taqiqlangan qurilmalar yo'q.
            </div>
        `;
        return;
    }

    data.forEach(item => {
        const dateString = new Date(item.created_at).toLocaleString("uz-UZ", {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        const card = document.createElement("div");
        card.className = "glass-card p-4 border border-red-500/10 flex flex-col justify-between gap-3";
        card.innerHTML = `
            <div class="space-y-2">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20">
                        Bloklangan
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono">
                        ${dateString}
                    </span>
                </div>
                <div class="space-y-1">
                    <p class="text-xs text-white font-mono cursor-pointer hover:text-blue-400" onclick="copyToClipboard('${item.device_id}')">
                        <strong>Device ID:</strong> ${truncateString(item.device_id, 24)} <i class="fa-solid fa-copy text-[8px]"></i>
                    </p>
                    <p class="text-xs text-slate-400"><strong>Sabab:</strong> ${escapeHtml(item.reason || 'Noma\'lum xavfli faoliyat')}</p>
                </div>
            </div>
            
            <div class="flex justify-end pt-2 border-t border-slate-800/40">
                <button onclick="removeFromBlacklist('${item.id}', '${item.device_id}')" class="py-1 px-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded border border-emerald-500/20 text-[10px] font-semibold">
                    Qulfdan chiqarish
                </button>
            </div>
        `;
        blacklistContainer.appendChild(card);
    });
}

// Add to Blacklist
async function promptAddBlacklist() {
    const { value: formValues } = await Swal.fire({
        title: 'Qurilmani qora ro\'yxatga kiritish',
        html:
            '<input id="swal-device-id" class="swal2-input bg-slate-900 border border-slate-800 text-xs font-mono text-white rounded p-2.5 w-full mb-3" placeholder="Qurilma (Device) ID kaliti">' +
            '<input id="swal-reason" class="swal2-input bg-slate-900 border border-slate-800 text-xs text-white rounded p-2.5 w-full" placeholder="Bloklash sababi (Masalan: Xizmatni o\'chirishga urindi)">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Bloklash',
        cancelButtonText: 'Bekor qilish',
        preConfirm: () => {
            const devId = document.getElementById('swal-device-id').value.trim();
            const reason = document.getElementById('swal-reason').value.trim();
            if (!devId) {
                Swal.showValidationMessage('Device ID kiritish shart!');
                return false;
            }
            return { deviceId: devId, reason: reason };
        }
    });

    if (formValues) {
        const { error } = await supabaseClient
            .from("blacklist")
            .insert([{ device_id: formValues.deviceId, reason: formValues.reason }]);

        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'Qurilma bloklandi!', timer: 1500, showConfirmButton: false });
            fetchBlacklist();
            fetchLicenses();
        }
    }
}

// Direct Quick Blacklist helper (for alert popup)
window.blacklistDeviceDirectly = async function(deviceId, employeeName, reason) {
    Swal.fire({ title: 'Bloklanmoqda...', didOpen: () => Swal.showLoading() });
    
    const { error } = await supabaseClient
        .from("blacklist")
        .insert([{ device_id: deviceId, reason: `Xodim: ${employeeName}. Sabab: ${reason}` }]);

    if (error) {
        Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
    } else {
        // Clear the alert from the screen
        await supabaseClient.from("security_alerts").delete().eq("device_id", deviceId);
        Swal.fire({ icon: 'success', title: 'Qurilma qora ro\'yxatga olindi!', timer: 1500, showConfirmButton: false });
        fetchBlacklist();
        fetchLicenses();
        fetchAlerts();
    }
}

// Remove from Blacklist
window.removeFromBlacklist = async function(id, deviceId) {
    const result = await Swal.fire({
        title: 'Qora ro\'yxatdan chiqarish?',
        text: `Qurilma (${truncateString(deviceId, 12)}) qayta litsenziya olishi mumkin bo'ladi.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ha, ochish',
        cancelButtonText: 'Bekor qilish'
    });

    if (result.isConfirmed) {
        const { error } = await supabaseClient.from("blacklist").delete().eq("id", id);
        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'Qulf ochildi!', timer: 1500, showConfirmButton: false });
            fetchBlacklist();
        }
    }
}

// Fetch Security Alerts & Show Live Popup Notifications
async function fetchAlerts(silent = false, force = false) {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from("security_alerts")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        if (error.code === "P0001" || error.message.includes("does not exist")) {
            sqlSetupNotice.classList.remove("hidden");
        }
        console.error("Alerts fetching error:", error);
        return;
    }

    sqlSetupNotice.classList.add("hidden");
    const newData = data || [];
    const hasChanged = JSON.stringify(newData) !== JSON.stringify(alertsData);
    if (hasChanged || force) {
        alertsData = newData;
        renderAlerts(alertsData);

        // Update tab badge status
        if (alertsData.length > 0) {
            alertsBadge.classList.remove("hidden");
            alertsCountBadge.innerText = alertsData.length;
            alertsCountBadge.classList.remove("hidden");

            // Check for new un-notified critical alerts to show popup
            alertsData.forEach(alert => {
                if (!notifiedAlertIds.has(alert.id)) {
                    notifiedAlertIds.add(alert.id);
                    
                    // Critical threat popup trigger (debugger, clock, services.msc stop attempt, security bypass)
                    showCriticalAlertPopup(alert);
                }
            });
        } else {
            alertsBadge.classList.add("hidden");
            alertsCountBadge.classList.add("hidden");
        }
    }
}

// Live Real-Time Critical Alert Popup Modal
function showCriticalAlertPopup(alert) {
    if (alert.alert_type === "UNAUTHORIZED_DEVICE") {
        // Find matching pending activation item if exists
        const pendingItem = pendingActivationsData.find(p => p.device_id === alert.device_id);
        const expiresAtVal = pendingItem ? pendingItem.expires_at : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const pendingId = pendingItem ? pendingItem.id : alert.id;

        Swal.fire({
            icon: 'info',
            title: "🆕 Yangi Faollashtirish So'rovi",
            html: `
                <div class="text-left space-y-3 text-sm border-t border-slate-800 pt-3">
                    <p class="text-blue-400 font-bold text-center">XODIM LITSENZIYANI FAOLLASHTIRISHNI SO'RAMOQDA</p>
                    <p><strong>Xodim:</strong> <span class="text-blue-400 font-medium">${escapeHtml(alert.employee_name || 'Noma\'lum')}</span></p>
                    <p><strong>Kompyuter (PC):</strong> <span class="text-slate-300 font-mono">${escapeHtml(alert.pc_name || 'Noma\'lum')} (${escapeHtml(alert.pc_user || 'Noma\'lum')})</span></p>
                    <p><strong>Device ID:</strong> <span class="text-slate-400 font-mono text-xs block bg-slate-950 p-2 rounded mt-1 border border-slate-900 overflow-x-auto">${alert.device_id}</span></p>
                </div>
            `,
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#10b981', // green for approve
            denyButtonColor: '#ef4444', // red for block
            cancelButtonColor: '#64748b', // gray for dismiss
            confirmButtonText: '✅ Tasdiqlash (Approve)',
            denyButtonText: '🚫 Bloklash (Blacklist)',
            cancelButtonText: 'Rad etish (Reject)'
        }).then(async (result) => {
            if (result.isConfirmed) {
                approveActivation(pendingId, alert.device_id, alert.employee_name || 'Noma\'lum', expiresAtVal);
            } else if (result.isDenied) {
                blacklistDeviceDirectly(alert.device_id, alert.employee_name || 'Noma\'lum', alert.details);
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                // Reject activation directly without double dialogs
                Swal.fire({ title: 'Rad etilmoqda...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
                if (pendingItem) {
                    await supabaseClient.from("pending_activations").delete().eq("id", pendingId);
                }
                await supabaseClient.from("security_alerts").delete().eq("id", alert.id);
                Swal.fire({ icon: 'success', title: 'Faollashtirish so\'rovi rad etildi!', timer: 1500, showConfirmButton: false });
                fetchPendingActivations();
                fetchAlerts();
            }
        });
        return;
    }

    let iconText = "🚨 Xavfli Amal Aniqlandi!";
    
    if (alert.alert_type === "SERVICE_STOP_ATTEMPT") {
        iconText = "🛑 Xizmatni O'chirishga Urinish!";
    } else if (alert.alert_type === "DEBUGGER_DETECTION") {
        iconText = "🪲 Buzish/Hacking Urinishi!";
    } else if (alert.alert_type === "CLOCK_TAMPER") {
        iconText = "⏳ Soat O'zgartirildi!";
    } else if (alert.alert_type === "SECURITY_BYPASS_ATTEMPT") {
        iconText = "⚡ Tizimni Chetlab O'tish Urinishi!";
    }

    Swal.fire({
        icon: 'warning',
        title: iconText,
        html: `
            <div class="text-left space-y-3 text-sm border-t border-slate-800 pt-3">
                <p class="text-red-400 font-bold">FAVQULODDA XAFVLI URINISh ANIQLaNDI!</p>
                <p><strong>Kompyuter nomi (PC Name):</strong> <span class="text-slate-300 font-mono">${escapeHtml(alert.pc_name || 'Noma\'lum')}</span></p>
                <p><strong>Foydalanuvchi (PC User):</strong> <span class="text-slate-300 font-mono">${escapeHtml(alert.pc_user || 'Noma\'lum')}</span></p>
                <p><strong>Xodim:</strong> <span class="text-blue-400 font-medium">${escapeHtml(alert.employee_name || 'Noma\'lum')}</span></p>
                <p><strong>Device ID:</strong> <span class="text-slate-400 font-mono text-xs block bg-slate-950 p-2 rounded mt-1 border border-slate-900 overflow-x-auto">${alert.device_id}</span></p>
                <p><strong>Amal ta'rifi:</strong> <span class="text-yellow-400 block mt-1">${escapeHtml(alert.details)}</span></p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Qora ro\'yxatga kiritish',
        cancelButtonText: 'Xabarni o\'chirish (Dismiss)'
    }).then((result) => {
        if (result.isConfirmed) {
            blacklistDeviceDirectly(alert.device_id, alert.employee_name || 'Noma\'lum', alert.details);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            deleteAlert(alert.id);
        }
    });
}

// Render Security Alerts
function renderAlerts(data) {
    alertsContainer.innerHTML = "";

    if (data.length === 0) {
        alertsContainer.innerHTML = `
            <div class="col-span-full text-center p-8 text-slate-500 glass-card w-full">
                <i class="fa-solid fa-shield-check text-3xl mb-2 text-emerald-500 block"></i>
                Hech qanday ogohlantirish xabarlari yo'q. Tizim xavfsiz.
            </div>
        `;
        return;
    }

    data.forEach(alert => {
        const timeString = new Date(alert.created_at).toLocaleString("uz-UZ", {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        let iconClass = "fa-solid fa-triangle-exclamation text-yellow-500";
        let typeLabel = alert.alert_type;
        let cardBorderClass = "border-red-500/10";
        let badgeClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

        if (alert.alert_type === "DEBUGGER_DETECTION") {
            iconClass = "fa-solid fa-bug text-red-500 animate-pulse";
            typeLabel = "Hacking / Debugger";
            cardBorderClass = "border-red-500/30 shadow-lg shadow-red-500/5";
            badgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
        } else if (alert.alert_type === "CLOCK_TAMPER") {
            iconClass = "fa-solid fa-clock-rotate-left text-orange-500";
            typeLabel = "Vaqt O'zgartirildi";
            cardBorderClass = "border-orange-500/20";
            badgeClass = "bg-orange-500/10 text-orange-400 border-orange-500/20";
        } else if (alert.alert_type === "UNAUTHORIZED_DEVICE") {
            iconClass = "fa-solid fa-user-slash text-purple-500";
            typeLabel = "Begona Qurilma";
            cardBorderClass = "border-purple-500/20";
            badgeClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";
        } else if (alert.alert_type === "REVOKED_DEVICE_ATTEMPT") {
            iconClass = "fa-solid fa-ban text-red-400";
            typeLabel = "Taqiqlangan Ulanish";
            cardBorderClass = "border-red-500/20";
            badgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
        } else if (alert.alert_type === "SERVICE_STOP_ATTEMPT") {
            iconClass = "fa-solid fa-power-off text-red-500";
            typeLabel = "Xizmat O'chirilishi";
            cardBorderClass = "border-red-500/30";
            badgeClass = "bg-red-500/10 text-red-400 border-red-500/20";
        } else if (alert.alert_type === "SECURITY_BYPASS_ATTEMPT") {
            iconClass = "fa-solid fa-bolt text-red-500 animate-bounce";
            typeLabel = "Bypass himoyasi";
            cardBorderClass = "border-red-500/40 shadow-lg shadow-red-500/10";
            badgeClass = "bg-red-500/20 text-red-400 border-red-500/30";
        }

        const card = document.createElement("div");
        card.className = `glass-card p-4 border ${cardBorderClass} flex flex-col justify-between gap-4`;
        card.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${badgeClass}">
                        ${typeLabel}
                    </span>
                    <span class="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <i class="fa-regular fa-clock"></i> ${timeString}
                    </span>
                </div>
                
                <div class="flex gap-3 items-start">
                    <div class="text-xl mt-0.5 flex-shrink-0">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="space-y-1">
                        <p class="text-xs text-white font-medium">${escapeHtml(alert.details || '')}</p>
                        <div class="text-[10px] text-slate-400 flex flex-col gap-1 pt-1 font-mono">
                            <span>PC Nomi: <strong class="text-slate-300 font-sans">${escapeHtml(alert.pc_name || 'Noma\'lum')}</strong> (${escapeHtml(alert.pc_user || 'Noma\'lum')})</span>
                            <span>Xodim: <strong class="text-slate-300 font-sans">${escapeHtml(alert.employee_name || 'Noma\'lum')}</strong></span>
                            <span class="cursor-pointer hover:text-blue-400 flex items-center gap-1" onclick="copyToClipboard('${alert.device_id}')">
                                ID: ${truncateString(alert.device_id, 12)} <i class="fa-solid fa-copy text-[8px]"></i>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
                <button onclick="blacklistDeviceDirectly('${alert.device_id}', '${alert.employee_name || 'Noma\'lum'}', '${alert.details}')" class="py-1 px-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded border border-red-500/20 text-[10px] font-semibold flex items-center gap-1">
                    <i class="fa-solid fa-ban"></i> Bloklash (Qora Ro'yxat)
                </button>
                <button onclick="deleteAlert('${alert.id}')" class="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[10px] font-semibold flex items-center gap-1">
                    <i class="fa-solid fa-check"></i> O'chirish
                </button>
            </div>
        `;
        alertsContainer.appendChild(card);
    });
}

// Delete Single Alert
window.deleteAlert = async function(id) {
    const { error } = await supabaseClient.from("security_alerts").delete().eq("id", id);
    if (error) {
        Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
    } else {
        fetchAlerts();
    }
}

// Clear All Alerts
async function clearAllAlerts() {
    if (alertsData.length === 0) return;

    const result = await Swal.fire({
        title: 'Barcha ogohlantirishlarni tozalash?',
        text: 'Ushbu operatsiyadan so\'ng barcha xavfsizlik jurnallari o\'chiriladi!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ha, tozalash!',
        cancelButtonText: 'Bekor qilish'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Tozalanmoqda...', didOpen: () => Swal.showLoading() });
        const { error } = await supabaseClient.from("security_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'Tozalandi!', timer: 1500, showConfirmButton: false });
            fetchAlerts();
        }
    }
}

// Search Filter in License list
searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = licensesData.filter(item => 
        item.employee_name.toLowerCase().includes(query) || 
        item.device_id.toLowerCase().includes(query)
    );
    renderLicenses(filtered);
});

// Update Statistics summary
function updateStats(data) {
    statTotal.innerText = data.length;
    
    // An active device is online in the last 90 seconds or has recent logs
    const activeCount = data.filter(item => {
        let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
        const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
        if (latestLog) {
            const logTime = new Date(latestLog.created_at);
            if (!lastSeen || logTime > lastSeen) lastSeen = logTime;
        }
        return lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;
    }).length;
    
    statActive.innerText = activeCount;

    const expiredCount = data.filter(item => new Date(item.expires_at) <= new Date()).length;
    statExpired.innerText = expiredCount;
}

// Dynamically updates the online/offline status dot without redrawing the whole DOM
function updateOnlineStatuses() {
    if (!licensesData) return;
    licensesData.forEach(item => {
        let lastSeen = item.updated_at ? new Date(item.updated_at) : null;
        const latestLog = activityLogsData.find(log => log.device_id === item.device_id);
        if (latestLog) {
            const logTime = new Date(latestLog.created_at);
            if (!lastSeen || logTime > lastSeen) lastSeen = logTime;
        }
        const isOnline = lastSeen && (new Date() - lastSeen) < 90000 && item.is_active;

        // 1. Update in licenses view (both desktop and mobile)
        const badges = document.querySelectorAll(`[data-badge-device-id="${item.device_id}"]`);
        badges.forEach(badge => {
            const currentOnline = badge.getAttribute("data-online") === "true";
            if (currentOnline !== isOnline) {
                badge.setAttribute("data-online", isOnline);
                badge.innerHTML = isOnline 
                    ? '<span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Tarmoqda'
                    : 'Oflayn';
                badge.className = isOnline
                    ? 'inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium'
                    : 'inline-flex items-center gap-1 text-[10px] bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded-full font-medium';
            }
        });

        // 2. Update in activity sidebar
        const sidebarBadge = document.querySelector(`[data-sidebar-device-id="${item.device_id}"]`);
        if (sidebarBadge) {
            const currentOnline = sidebarBadge.getAttribute("data-online") === "true";
            if (currentOnline !== isOnline) {
                sidebarBadge.setAttribute("data-online", isOnline);
                sidebarBadge.className = isOnline
                    ? 'w-2 h-2 bg-emerald-500 rounded-full animate-pulse'
                    : 'w-2 h-2 bg-slate-600 rounded-full';
                sidebarBadge.title = isOnline ? "Tarmoqda" : "Oflayn";
            }
        }
    });
}

// Copy Helper
function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500
    });
    Toast.fire({ icon: 'success', title: 'Nusxalandi!' });
}

// Copy SQL Code helper
window.copySqlCode = function() {
    const sqlText = document.getElementById("sqlSetupText").innerText;
    navigator.clipboard.writeText(sqlText);
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500
    });
    Toast.fire({ icon: 'success', title: 'SQL kod nusxalandi!' });
}

// Modal triggers
addLicenseBtn.addEventListener("click", () => {
    modalTitle.innerText = "Yangi Litsenziya Qo'shish";
    licenseId.value = "";
    licenseForm.reset();
    expiresAt.value = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16); // Default 30 days
    licenseModal.classList.remove("hidden");
});

const closeModal = () => licenseModal.classList.add("hidden");
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);

// Edit Mode
window.editLicense = function(id) {
    const item = licensesData.find(item => item.id === id);
    if (!item) return;

    modalTitle.innerText = "Litsenziyani Tahrirlash";
    licenseId.value = item.id;
    employeeName.value = item.employee_name;
    deviceId.value = item.device_id;
    
    const date = new Date(item.expires_at);
    const formattedDate = date.toISOString().slice(0, 16);
    expiresAt.value = formattedDate;

    licenseModal.classList.remove("hidden");
}

// Save License Form Submit (With Blacklist Conflict Resolution)
licenseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = licenseId.value;
    const name = employeeName.value.trim();
    const devId = deviceId.value.trim();
    const expAt = new Date(expiresAt.value).toISOString();

    // Conflict Check: Check if Device ID exists in blacklist first
    const isBlacklisted = blacklistData.some(b => b.device_id === devId);
    if (isBlacklisted) {
        const confirmConflict = await Swal.fire({
            title: 'Qora ro\'yxat ziddiyati!',
            text: 'Ushbu Device ID hozirda qora ro\'yxatda bor. Litsenziya berish uchun u qora ro\'yxatdan o\'chirilishi kerak. Shunda ham ruxsat berasizmi?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ha, ruxsat berish (Ochish)',
            cancelButtonText: 'Bekor qilish'
        });

        if (!confirmConflict.isConfirmed) {
            return; // Abort
        }

        // Delete from blacklist first
        Swal.fire({ title: 'Qora ro\'yxatdan o\'chirilmoqda...', didOpen: () => Swal.showLoading() });
        const { error: blacklistErr } = await supabaseClient.from("blacklist").delete().eq("device_id", devId);
        if (blacklistErr) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: 'Qora ro\'yxatdan o\'chirib bo\'lmadi: ' + blacklistErr.message });
            return;
        }
    }

    Swal.fire({ title: 'Saqlanmoqda...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    let error = null;

    if (id) {
        const { error: err } = await supabaseClient
            .from("licenses")
            .update({ employee_name: name, device_id: devId, expires_at: expAt, updated_at: new Date().toISOString() })
            .eq("id", id);
        error = err;
    } else {
        const { error: err } = await supabaseClient
            .from("licenses")
            .insert([{ employee_name: name, device_id: devId, expires_at: expAt }]);
        error = err;
    }

    if (error) {
        Swal.fire({ icon: 'error', title: 'Xatolik yuz berdi', text: error.message });
    } else {
        Swal.fire({ icon: 'success', title: 'Muvaffaqiyatli saqlandi', timer: 1500, showConfirmButton: false });
        closeModal();
        fetchLicenses();
        fetchBlacklist();
    }
});

// Delete License
window.deleteLicense = async function(id) {
    const item = licensesData.find(item => item.id === id);
    if (!item) return;

    const result = await Swal.fire({
        title: 'O\'chirishni tasdiqlaysizmi?',
        text: `${item.employee_name}ga tegishli qurilma ruxsati o'chib ketadi!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ha, o\'chirish!',
        cancelButtonText: 'Bekor qilish'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'O\'chirilmoqda...', didOpen: () => Swal.showLoading() });
        const { error } = await supabaseClient.from("licenses").delete().eq("id", id);

        if (error) {
            Swal.fire({ icon: 'error', title: 'Xatolik', text: error.message });
        } else {
            Swal.fire({ icon: 'success', title: 'O\'chirildi!', timer: 1500, showConfirmButton: false });
            fetchLicenses();
        }
    }
}

// Helpers
function truncateString(str, num) {
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
}

function escapeHtml(text) {
    if (!text) return "";
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}
