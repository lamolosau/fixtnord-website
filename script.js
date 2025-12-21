// script.js

// =============================================================================
// 1. INITIALISATION SUPABASE (Sécurisée)
// =============================================================================

// On vérifie que le fichier config.js est bien chargé
if (typeof CONFIG === "undefined") {
  console.error("❌ ERREUR CRITIQUE : config.js n'est pas chargé !");
  alert("Erreur de configuration du site. Vérifiez la console.");
}

let sbClient = null; // On utilise un nom unique pour éviter les conflits

if (window.supabase) {
  try {
    sbClient = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY
    );
    console.log("✅ Supabase connecté avec succès.");
  } catch (err) {
    console.error("❌ Erreur lors de l'initialisation Supabase:", err);
  }
} else {
  console.error("❌ La librairie Supabase n'a pas été chargée (problème CDN).");
}

// Couleurs pour les statuts
const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. FONCTIONS UTILITAIRES (Notifications & Modales)
// =============================================================================

window.showNotification = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return console.log("Notification:", message);

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
    info: {
      bg: "bg-blue-500/90",
      border: "border-blue-400",
      icon: '<i class="fa-solid fa-circle-info"></i>',
    },
  };

  const style = styles[type] || styles.success;
  const toast = document.createElement("div");
  toast.className = `pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-xl border ${style.border} ${style.bg} text-white shadow-2xl backdrop-blur-md mb-3 transition-all duration-500 transform translate-y-10 opacity-0`;
  toast.innerHTML = `<div class="text-xl">${style.icon}</div><div class="font-bold text-sm drop-shadow-md">${message}</div>`;

  container.appendChild(toast);

  // Animation entrée
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0")
  );

  // Auto-suppression
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

// Gestion des Modales
window.openModal = (id) => document.getElementById(id)?.classList.add("active");
window.closeModal = (id) =>
  document.getElementById(id)?.classList.remove("active");

let pendingAction = null;
window.showConfirm = function (message, callback) {
  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.innerText = message;
  pendingAction = callback;
  openModal("modal-confirm");
};

// =============================================================================
// 3. FONCTIONS BASE DE DONNÉES (CRUD)
// =============================================================================

async function fetchServices() {
  const { data, error } = await sbClient
    .from("services")
    .select("*")
    .order("price");
  if (error) console.error("Erreur fetch services:", error);
  return data || [];
}

async function dbFetchBookings() {
  return await sbClient
    .from("bookings")
    .select("*")
    .order("start_time", { ascending: false });
}

async function dbUpdateBookingStatus(id, status) {
  return await sbClient
    .from("bookings")
    .update({ status: status })
    .eq("id", id);
}

async function dbDeleteBooking(id) {
  return await sbClient.from("bookings").delete().eq("id", id);
}

// =============================================================================
// 4. LOGIQUE CLIENT (Booking Page)
// =============================================================================

let currentService = null;

async function renderServiceSelector() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;

  container.innerHTML =
    '<div class="text-center text-blue-300 py-4"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';

  const services = await fetchServices();

  if (services.length === 0) {
    container.innerHTML =
      '<div class="text-center text-red-300">Aucun service disponible.</div>';
    return;
  }

  container.innerHTML = services
    .map((s) => {
      const safeName = s.name.replace(/'/g, "\\'");
      return `
        <div onclick="selectService(${s.id}, '${safeName}', ${s.price}, ${s.duration}, this)" 
             class="service-card border border-white/20 bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-white/10 transition mb-2 flex justify-between items-center group">
             <div>
                <div class="font-bold text-white text-lg">${s.name}</div>
                <div class="text-xs text-blue-300 font-medium"><i class="fa-regular fa-clock"></i> ${s.duration} min</div>
             </div>
             <div class="font-bold text-[#5475FF] bg-blue-50 px-3 py-1 rounded-lg shadow-sm">${s.price}€</div>
        </div>`;
    })
    .join("");
}

window.selectService = function (id, name, price, duration, el) {
  // Gestion UI sélection
  document
    .querySelectorAll(".service-card")
    .forEach((c) =>
      c.classList.remove("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg")
    );
  el.classList.add("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg"); // Note: le texte doit changer de couleur via CSS si besoin

  currentService = { id, name, price, duration };

  // Mise à jour résumé
  document.getElementById("summary-service").innerText = name;
  document.getElementById("total-price-display").innerText = price + "€";

  // Débloquer étape suivante
  const dateStep = document.getElementById("date-step");
  if (dateStep) dateStep.classList.remove("opacity-50", "pointer-events-none");

  // Reset date si déjà sélectionnée
  if (document.getElementById("date-picker").value) onDateChanged();
};

window.onDateChanged = async function () {
  const dateVal = document.getElementById("date-picker").value;
  if (!dateVal || !currentService) return;

  const container = document.getElementById("slots-container");
  const loader = document.getElementById("slots-loader");

  if (loader) loader.classList.remove("hidden");
  container.innerHTML = "";

  // Calcul des dates
  const startDay = new Date(dateVal);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(dateVal);
  endDay.setHours(23, 59, 59, 999);

  // Récupération disponibilités
  const { data: slots } = await sbClient
    .from("slots")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  const { data: bookings } = await sbClient
    .from("bookings")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  if (loader) loader.classList.add("hidden");
  document
    .getElementById("slots-step")
    .classList.remove("opacity-50", "pointer-events-none");

  if (!slots || slots.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-slate-400 py-2">Aucun créneau ouvert ce jour.</div>';
    return;
  }

  // Logique de fusion des créneaux (simplifiée ici)
  // Pour l'instant on affiche juste un message pour tester la mécanique
  // Vous pouvez réintégrer votre logique "mergeContiguousSlots" ici

  // SIMULATION POUR TESTER LE RENDU :
  container.innerHTML = `<div class="col-span-3 text-center text-blue-300">Créneaux chargés (${slots.length} zones dispo)</div>`;

  // Affichage date résumé
  const d = new Date(dateVal);
  document.getElementById("summary-date").innerText = d.toLocaleDateString(
    "fr-FR",
    { weekday: "long", day: "numeric", month: "long" }
  );
  document.getElementById("final-date").value = dateVal;
};

// =============================================================================
// 5. LOGIQUE ADMIN & AUTHENTIFICATION (Le point critique)
// =============================================================================

async function checkAuth() {
  console.log("🔒 Security Check...");

  if (!sbClient) {
    console.error("⛔ Supabase non initialisé -> Redirection forcée Login");
    window.location.href = "login.html";
    return;
  }

  const {
    data: { session },
    error,
  } = await sbClient.auth.getSession();

  const isAdminPage =
    document.querySelector("#view-dashboard") ||
    document.querySelector(".glass-sidebar");
  const isLoginPage = document.getElementById("login-form");

  if (isAdminPage) {
    if (!session || error) {
      console.warn("⛔ Non connecté sur Admin -> Redirection Login");
      window.location.href = "login.html";
    } else {
      console.log("✅ Admin identifié -> Ouverture du Dashboard");
      // C'EST ICI QUE L'ON DÉBLOQUE L'AFFICHAGE
      document.body.setAttribute("style", "display: flex !important");

      // Initialisation des données Admin
      renderAdminStats();
      renderAllBookingsView();
      // Si FullCalendar est présent
      if (window.FullCalendar) setTimeout(initAdminCalendar, 500);
    }
  } else if (isLoginPage) {
    if (session) {
      console.log("🔄 Déjà connecté -> Redirection Admin");
      window.location.href = "admin.html";
    }
  }
}

// Stats Admin
async function renderAdminStats() {
  if (!document.getElementById("stat-revenue")) return;

  const { data: bookings } = await sbClient.from("bookings").select("price");
  if (bookings) {
    const total = bookings.reduce((acc, curr) => acc + (curr.price || 0), 0);
    document.getElementById("stat-revenue").innerText = total + "€";
    document.getElementById("count-rdv").innerText = bookings.length;
  }
}

// Liste des réservations Admin
async function renderAllBookingsView() {
  const tbody = document.getElementById("all-bookings-table-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';

  const { data: bookings } = await dbFetchBookings();

  if (!bookings || bookings.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-4 text-slate-500">Aucune réservation.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings
    .map(
      (b) => `
        <tr class="border-b border-white/5 hover:bg-white/5">
            <td class="p-4">${new Date(
              b.start_time
            ).toLocaleDateString()} ${new Date(b.start_time).toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )}</td>
            <td class="p-4 font-bold text-white">${b.customer_name}</td>
            <td class="p-4">${b.service_name}</td>
            <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold uppercase status-${
              b.status
            }" style="background:${STATUS_COLORS[b.status]?.bg || "#333"}">${
        b.status
      }</span></td>
            <td class="p-4 text-right">
                <button onclick="quickAction('${
                  b.id
                }', 'delete')" class="text-red-400 hover:text-white"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `
    )
    .join("");
}

window.quickAction = async (id, action) => {
  if (action === "delete") {
    if (confirm("Supprimer ce RDV ?")) {
      await dbDeleteBooking(id);
      renderAllBookingsView();
      renderAdminStats();
    }
  }
};

window.logout = async () => {
  await sbClient.auth.signOut();
  window.location.href = "login.html";
};

// =============================================================================
// 6. INITIALISATION (MAIN)
// =============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Application Démarrée");

  // 1. Vérification Auth (partout)
  await checkAuth();

  // 2. Logique Page Login
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector("button");
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = "Connexion...";

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      const { error } = await sbClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        document.getElementById("login-error").classList.remove("hidden");
        btn.disabled = false;
        btn.innerHTML = originalText;
      } else {
        window.location.href = "admin.html";
      }
    });
  }

  // 3. Logique Page Booking
  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    // Date minimum = aujourd'hui
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }

  // 4. Modal Confirmation Listener
  const btnConf = document.getElementById("btn-confirm-action");
  if (btnConf) {
    btnConf.addEventListener("click", () => {
      if (pendingAction) pendingAction();
      closeModal("modal-confirm");
    });
  }
});
