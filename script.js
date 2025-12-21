// =============================================================================
// 1. CONFIGURATION & INITIALISATION (Tout en un)
// =============================================================================

// CLÉS SUPABASE (Intégrées)
const SB_URL = "https://kpndqsranyqwcjzggfyu.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwbmRxc3Jhbnlxd2NqemdnZnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTA5MTEsImV4cCI6MjA3NjUyNjkxMX0.XJ5cj5nrv7VyQsStFe-N6rByU34bmkFMneWj3Jv42yI";

// Initialisation sécurisée pour éviter les conflits de nom
let appClient = null;

try {
  if (window.supabase) {
    appClient = window.supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Système Fixt connecté.");
  } else {
    console.error(
      "❌ ERREUR CRITIQUE : La librairie Supabase n'est pas chargée."
    );
  }
} catch (err) {
  console.error("❌ Erreur d'initialisation :", err);
}

// Couleurs et config
const SHOP_CONFIG = { stepMinutes: 30 };
const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. GESTION DE L'INTERFACE (UI, MODALES, ONGLETS)
// =============================================================================

// Système de notification (Toasts)
window.showNotification = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return alert(message); // Fallback

  const styles = {
    success: {
      bg: "bg-emerald-500/90",
      border: "border-emerald-400",
      icon: '<i class="fa-solid fa-check-circle"></i>',
    },
    error: {
      bg: "bg-red-500/90",
      border: "border-red-400",
      icon: '<i class="fa-solid fa-triangle-exclamation"></i>',
    },
  };

  const style = styles[type] || styles.success;
  const toast = document.createElement("div");
  toast.className = `pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-xl border ${style.border} ${style.bg} text-white shadow-2xl backdrop-blur-md mb-3 transition-all duration-500 transform translate-y-10 opacity-0`;
  toast.innerHTML = `<div class="text-xl">${style.icon}</div><div class="font-bold text-sm drop-shadow-md">${message}</div>`;

  container.appendChild(toast);
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0")
  );
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

// Gestion des Modales (Ouverture/Fermeture)
window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
};

window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
};

// Modale de confirmation (Pour la déconnexion et suppression)
let pendingAction = null;
window.showConfirm = function (message, callback) {
  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.innerText = message;
  pendingAction = callback;
  openModal("modal-confirm");
};

// Gestion des Onglets (Sidebar Admin)
window.switchTab = function (tabName) {
  // 1. Cacher toutes les vues
  document
    .querySelectorAll('[id^="view-"]')
    .forEach((el) => el.classList.add("hidden-view"));
  // 2. Désactiver tous les boutons
  document
    .querySelectorAll(".nav-btn")
    .forEach((el) => el.classList.remove("active"));

  // 3. Afficher la vue demandée
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.classList.remove("hidden-view");

  // 4. Activer le bouton
  const targetBtn = document.getElementById(`btn-${tabName}`);
  if (targetBtn) targetBtn.classList.add("active");

  // 5. Charger les données spécifiques
  if (tabName === "bookings") renderAllBookingsView();
  if (tabName === "services") renderAdminStats(); // Recharge aussi la liste des services
  if (tabName === "calendar" && typeof initAdminCalendar === "function")
    setTimeout(initAdminCalendar, 100);
};

// =============================================================================
// 3. SÉCURITÉ & AUTHENTIFICATION
// =============================================================================

async function checkAuth() {
  if (!appClient) return;

  const isAdminPage =
    document.getElementById("view-dashboard") ||
    document.querySelector(".glass-sidebar");
  const isLoginPage = document.getElementById("login-form");

  // Vérifier la session
  const { data } = await appClient.auth.getSession();
  const session = data?.session;

  if (isAdminPage) {
    if (!session) {
      console.log("⛔ Accès refusé -> Login");
      window.location.href = "login.html";
    } else {
      console.log("✅ Admin connecté :", session.user.email);
      // ON AFFICHE LA PAGE
      document.body.style.setProperty("display", "flex", "important");

      // CHARGEMENT INITIAL DES DONNÉES
      renderAdminStats();
      renderAllBookingsView();
      // Initialiser le calendrier si présent
      if (window.FullCalendar && document.getElementById("calendar")) {
        setTimeout(initAdminCalendar, 500);
      }
    }
  } else if (isLoginPage) {
    if (session) {
      window.location.href = "admin.html";
    }
  }
}

// Fonction de déconnexion (reliée à la modale)
window.logout = function () {
  showConfirm("Voulez-vous vraiment vous déconnecter ?", async () => {
    await appClient.auth.signOut();
    window.location.href = "login.html";
  });
};

// =============================================================================
// 4. LOGIQUE ADMIN (Données & Affichage)
// =============================================================================

// Récupération des données
async function fetchServices() {
  const { data } = await appClient.from("services").select("*").order("price");
  return data || [];
}
async function dbFetchBookings() {
  return await appClient
    .from("bookings")
    .select("*")
    .order("start_time", { ascending: false });
}

// Stats & Services
async function renderAdminStats() {
  // 1. Stats Revenue
  if (document.getElementById("stat-revenue")) {
    const { data: bookings } = await appClient.from("bookings").select("*");
    if (bookings) {
      const total = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
      document.getElementById("stat-revenue").innerText = total + "€";
      document.getElementById("count-rdv").innerText = bookings.length;
    }
  }

  // 2. Liste des Services (Onglet Services)
  const srvList = document.getElementById("admin-services-list");
  if (srvList) {
    const services = await fetchServices();
    if (document.getElementById("count-services"))
      document.getElementById("count-services").innerText = services.length;

    srvList.innerHTML = services.length
      ? services
          .map(
            (s) => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition">
                <div>
                    <div class="font-bold text-white">${s.name}</div>
                    <div class="text-xs text-slate-400">${s.duration} min</div>
                </div>
                <div class="flex items-center gap-4">
                    <span class="font-bold text-[#5475FF]">${s.price}€</span>
                    <button onclick="dbDeleteService(${s.id})" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`
          )
          .join("")
      : '<div class="text-slate-500 italic">Aucun service configuré.</div>';
  }
}

// Tableau des réservations
async function renderAllBookingsView() {
  const tbody = document.getElementById("all-bookings-table-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-[#5475FF]"></i></td></tr>';

  const { data: bookings } = await dbFetchBookings();

  if (!bookings || bookings.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-4 text-slate-500">Aucune réservation trouvée.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings
    .map((b) => {
      const dateObj = new Date(b.start_time);
      const dateStr = dateObj.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      });
      const timeStr = dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `
        <tr class="group border-b border-white/5 hover:bg-white/5 transition">
            <td class="p-4">
                <div class="font-bold text-white">${dateStr}</div>
                <div class="text-xs text-slate-500">${timeStr}</div>
            </td>
            <td class="p-4">
                <div class="font-bold text-white">${b.customer_name}</div>
                <div class="text-xs text-slate-500">${
                  b.car_model || "Non spécifié"
                }</div>
            </td>
            <td class="p-4 text-slate-300">${b.service_name}</td>
            <td class="p-4"><span class="status-badge status-${b.status}">${
        b.status
      }</span></td>
            <td class="p-4 text-right">
                <button onclick="quickAction('${
                  b.id
                }', 'delete')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    })
    .join("");
}

// Actions Rapides
window.quickAction = function (id, action) {
  if (action === "delete") {
    showConfirm("Supprimer définitivement ce rendez-vous ?", async () => {
      await appClient.from("bookings").delete().eq("id", id);
      renderAllBookingsView();
      renderAdminStats();
      showNotification("Rendez-vous supprimé", "success");
    });
  }
};

// Gestion Services (Ajout/Suppr)
window.handleAddService = async function (e) {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  const originalText = btn.innerText;
  btn.innerText = "...";
  btn.disabled = true;

  const { error } = await appClient.from("services").insert([
    {
      name: e.target.name.value,
      price: e.target.price.value,
      duration: e.target.duration.value,
    },
  ]);

  if (!error) {
    e.target.reset();
    renderAdminStats();
    showNotification("Service ajouté !", "success");
  } else {
    showNotification("Erreur ajout service", "error");
  }
  btn.innerText = originalText;
  btn.disabled = false;
};

window.dbDeleteService = function (id) {
  showConfirm("Supprimer ce service du catalogue ?", async () => {
    await appClient.from("services").delete().eq("id", id);
    renderAdminStats();
    showNotification("Service supprimé", "success");
  });
};

// =============================================================================
// 5. LOGIQUE CLIENT (Booking Page)
// =============================================================================
// (Partie simplifiée pour ne pas surcharger, mais fonctionnelle pour la prise de RDV)

let currentService = null;
window.selectService = function (id, name, price, duration, element) {
  // Reset UI
  document
    .querySelectorAll(".service-card")
    .forEach((el) =>
      el.classList.remove("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg")
    );
  element.classList.add("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg");

  currentService = { id, name, price, duration };
  document.getElementById("summary-service").innerText = name;
  document.getElementById("total-price-display").innerText = price + "€";

  // UI Transitions
  const step2 = document.getElementById("date-step");
  if (step2) step2.classList.remove("opacity-50", "pointer-events-none");

  const dp = document.getElementById("date-picker");
  if (dp && dp.value) onDateChanged();
};

async function renderServiceSelector() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;
  container.innerHTML =
    '<div class="text-center py-4 text-blue-300"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';

  const services = await fetchServices();
  if (services.length === 0) {
    container.innerHTML =
      "<p class='text-center text-slate-400'>Aucun service.</p>";
    return;
  }

  container.innerHTML = services
    .map((s) => {
      const safeName = s.name.replace(/'/g, "\\'");
      return `
        <div onclick="selectService(${s.id}, '${safeName}', ${s.price}, ${s.duration}, this)" 
             class="service-card border border-white/20 bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-white/10 transition mb-2 flex justify-between items-center group">
             <div><div class="font-bold text-white text-lg">${s.name}</div><div class="text-xs text-blue-300 font-medium">${s.duration} min</div></div>
             <div class="font-bold text-[#5475FF] bg-blue-50 px-3 py-1 rounded-lg shadow-sm">${s.price}€</div>
        </div>`;
    })
    .join("");
}

window.onDateChanged = async function () {
  const dateInput = document.getElementById("date-picker").value;
  if (!dateInput || !currentService) return;

  const container = document.getElementById("slots-container");
  const loader = document.getElementById("slots-loader");
  if (loader) loader.classList.remove("hidden");
  container.innerHTML = "";
  document
    .getElementById("slots-step")
    .classList.remove("opacity-50", "pointer-events-none");

  // Dates
  const startDay = new Date(dateInput);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(dateInput);
  endDay.setHours(23, 59, 59, 999);

  // Fetch Slots & Bookings
  const { data: rawSlots } = await appClient
    .from("slots")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());
  const { data: busyBookings } = await appClient
    .from("bookings")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  if (loader) loader.classList.add("hidden");

  if (!rawSlots || rawSlots.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-slate-400 py-2">Aucune disponibilité.</div>';
    return;
  }

  rawSlots.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  let html = "";
  rawSlots.forEach((slot) => {
    const timeStr = new Date(slot.start_time).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const slotStart = new Date(slot.start_time);
    const slotEnd = new Date(slot.end_time);

    const isBusy = busyBookings.some((b) => {
      const bStart = new Date(b.start_time);
      const bEnd = new Date(b.end_time);
      return slotStart < bEnd && slotEnd > bStart;
    });

    if (!isBusy) {
      html += `<div class="time-slot" onclick="selectTime('${timeStr}', '${slot.start_time}', this)">${timeStr}</div>`;
    }
  });
  container.innerHTML =
    html ||
    '<div class="col-span-3 text-center text-orange-400 py-2">Complet.</div>';

  // Maj Résumé Date
  const [y, m, d] = dateInput.split("-");
  document.getElementById("summary-date").innerText = new Date(
    y,
    m - 1,
    d
  ).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

window.selectTime = function (timeStr, isoStart, element) {
  document
    .querySelectorAll(".time-slot")
    .forEach((el) => el.classList.remove("selected"));
  element.classList.add("selected");
  document.getElementById("final-time").value = timeStr;
  document.getElementById("summary-time").innerText = " à " + timeStr;
  window.selectedSlotIso = isoStart;

  const btn = document.getElementById("pay-btn");
  btn.disabled = false;
  btn.classList.remove("opacity-50", "cursor-not-allowed");
};

window.handlePayment = async function (e) {
  e.preventDefault();
  const btn = document.getElementById("pay-btn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
  btn.disabled = true;

  if (!window.selectedSlotIso) return alert("Erreur heure");

  const start = new Date(window.selectedSlotIso);
  const end = new Date(start.getTime() + currentService.duration * 60000);

  const { error } = await appClient.from("bookings").insert([
    {
      customer_name: (
        document.getElementById("prenom").value +
        " " +
        document.getElementById("nom").value
      ).trim(),
      email: document.getElementById("email").value,
      car_model: document.getElementById("modele").value,
      phone: document.getElementById("tel").value,
      service_name: currentService.name,
      price: currentService.price,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "pending",
    },
  ]);

  if (!error) {
    showNotification("RDV Confirmé !", "success");
    setTimeout(() => (window.location.href = "index.html"), 2000);
  } else {
    alert("Erreur: " + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// =============================================================================
// 6. INITIALISATION GLOBALE
// =============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initialisation...");

  // Gestion du bouton de confirmation de la modale
  const btnConfirm = document.getElementById("btn-confirm-action");
  if (btnConfirm) {
    btnConfirm.addEventListener("click", () => {
      if (pendingAction) pendingAction();
      closeModal("modal-confirm");
      pendingAction = null;
    });
  }

  // Lancer la sécurité
  await checkAuth();

  // Login Form
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector("button");
      const originalText = btn.innerHTML;
      btn.innerHTML = "Connexion...";
      btn.disabled = true;

      const { error } = await appClient.auth.signInWithPassword({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      });

      if (error) {
        document.getElementById("login-error").classList.remove("hidden");
        btn.innerHTML = originalText;
        btn.disabled = false;
      } else {
        window.location.href = "admin.html";
      }
    });
  }

  // Booking Page
  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }
});
