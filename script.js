// =============================================================================
// 1. CONFIGURATION & INITIALISATION (Tout en un)
// =============================================================================

// VOS CLÉS SUPABASE (Intégrées directement pour éviter les erreurs de chargement)
const SB_URL = "https://kpndqsranyqwcjzggfyu.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwbmRxc3Jhbnlxd2NqemdnZnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTA5MTEsImV4cCI6MjA3NjUyNjkxMX0.XJ5cj5nrv7VyQsStFe-N6rByU34bmkFMneWj3Jv42yI";

// --- CORRECTION DU BUG "ALREADY DECLARED" ---
// On utilise 'appClient' au lieu de 'supabase' pour ne pas entrer en conflit avec la librairie.
let appClient = null;

try {
  if (window.supabase) {
    appClient = window.supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Système connecté.");
  } else {
    console.error(
      "❌ ERREUR CRITIQUE : La librairie Supabase n'est pas chargée."
    );
  }
} catch (err) {
  console.error("❌ Erreur d'initialisation :", err);
}

// Paramètres
const SHOP_CONFIG = { stepMinutes: 30 };
const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. FONCTIONS DE SÉCURITÉ (ADMIN)
// =============================================================================

async function checkAuth() {
  // Si la librairie a planté, on arrête tout
  if (!appClient) return;

  const isAdminPage =
    document.getElementById("view-dashboard") ||
    document.querySelector(".glass-sidebar");
  const isLoginPage = document.getElementById("login-form");

  // On récupère la session
  const { data, error } = await appClient.auth.getSession();
  const session = data?.session;

  // SCÉNARIO 1 : ON EST SUR LE DASHBOARD ADMIN
  if (isAdminPage) {
    if (!session) {
      // Pas connecté -> Hop, dehors
      console.log("⛔ Accès refusé. Redirection...");
      window.location.href = "login.html";
    } else {
      // Connecté -> ON OUVRE LES VANNES (On affiche la page)
      console.log("✅ Accès autorisé :", session.user.email);
      document.body.style.setProperty("display", "flex", "important");

      // On charge les données seulement maintenant
      if (typeof initAdminCalendar === "function")
        setTimeout(initAdminCalendar, 500);
      renderAdminStats();
      renderAllBookingsView();
    }
  }
  // SCÉNARIO 2 : ON EST SUR LE LOGIN
  else if (isLoginPage) {
    if (session) {
      // Déjà connecté -> On va direct au dashboard
      window.location.href = "admin.html";
    } else {
      // Pas connecté -> On laisse le login s'afficher
      // (Pas besoin de forcer le display ici car le login n'est pas caché par défaut)
    }
  }
}

// =============================================================================
// 3. FONCTIONS BASE DE DONNÉES
// =============================================================================

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

// =============================================================================
// 4. LOGIQUE CLIENT (RÉSERVATION)
// =============================================================================
let currentService = null;

async function renderServiceSelector() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;

  container.innerHTML =
    '<div class="text-center py-4 text-blue-300"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
  const services = await fetchServices();

  if (services.length === 0) {
    container.innerHTML =
      "<p class='text-center text-slate-400'>Aucun service disponible.</p>";
    return;
  }

  container.innerHTML = services
    .map((s) => {
      // Protection contre les apostrophes dans le nom
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

window.selectService = function (id, name, price, duration, element) {
  document
    .querySelectorAll(".service-card")
    .forEach((el) =>
      el.classList.remove("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg")
    );
  element.classList.add("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg");

  currentService = { id, name, price, duration };
  document.getElementById("summary-service").innerText = name;
  document.getElementById("total-price-display").innerText = price + "€";

  // Débloque l'étape 2
  document
    .getElementById("date-step")
    .classList.remove("opacity-50", "pointer-events-none");
  if (document.getElementById("date-picker").value) onDateChanged();
};

window.onDateChanged = async function () {
  const dateInput = document.getElementById("date-picker").value;
  if (!dateInput || !currentService) return;

  const container = document.getElementById("slots-container");
  const loader = document.getElementById("slots-loader");

  if (loader) loader.classList.remove("hidden");
  container.innerHTML = "";

  // On débloque l'étape 3
  document
    .getElementById("slots-step")
    .classList.remove("opacity-50", "pointer-events-none");

  // Calcul de la plage horaire du jour sélectionné
  const startDay = new Date(dateInput);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(dateInput);
  endDay.setHours(23, 59, 59, 999);

  // Récupération des créneaux ouverts (Slots)
  const { data: rawSlots } = await appClient
    .from("slots")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  // Récupération des RDV déjà pris (pour éviter les doublons)
  const { data: busyBookings } = await appClient
    .from("bookings")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  if (loader) loader.classList.add("hidden");

  if (!rawSlots || rawSlots.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-slate-400 py-2">Aucune disponibilité ce jour.</div>';
    return;
  }

  // Algorithme simple : on affiche les créneaux ouverts
  // (Version simplifiée pour garantir le fonctionnement immédiat)
  rawSlots.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  let html = "";
  rawSlots.forEach((slot) => {
    const timeStr = new Date(slot.start_time).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Vérifie si ce créneau chevauche un RDV existant
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

  if (html === "") {
    container.innerHTML =
      '<div class="col-span-3 text-center text-orange-400 py-2">Complet.</div>';
  } else {
    container.innerHTML = html;
  }

  // Mise à jour date résumé
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
  document.getElementById("final-date").value = dateInput;
};

window.selectTime = function (timeStr, isoStart, element) {
  document
    .querySelectorAll(".time-slot")
    .forEach((el) => el.classList.remove("selected"));
  element.classList.add("selected");

  document.getElementById("final-time").value = timeStr;
  document.getElementById("summary-time").innerText = " à " + timeStr;

  // IMPORTANT : On garde l'heure exacte du slot sélectionné pour le début du RDV
  // (On stocke l'ISO complet dans un attribut data ou variable globale pour être précis)
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

  if (!window.selectedSlotIso) {
    alert("Erreur: Veuillez sélectionner une heure.");
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }

  const start = new Date(window.selectedSlotIso);
  const end = new Date(start.getTime() + currentService.duration * 60000);

  const bookingData = {
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
  };

  const { error } = await appClient.from("bookings").insert([bookingData]);

  if (!error) {
    showNotification("Rendez-vous confirmé !", "success");
    setTimeout(() => (window.location.href = "index.html"), 2000);
  } else {
    showNotification("Erreur: " + error.message, "error");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// =============================================================================
// 5. FONCTIONS ADMIN (Gestion & Dashboard)
// =============================================================================

async function renderAdminStats() {
  if (!document.getElementById("stat-revenue")) return;
  const { data: bookings } = await appClient.from("bookings").select("*");
  if (bookings) {
    const total = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
    document.getElementById("stat-revenue").innerText = total + "€";
    document.getElementById("count-rdv").innerText = bookings.length;
  }
}

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
        <tr>
            <td class="p-3 text-white">${new Date(
              b.start_time
            ).toLocaleDateString()} ${new Date(b.start_time).toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )}</td>
            <td class="p-3 font-bold text-white">${b.customer_name}</td>
            <td class="p-3 text-slate-300">${b.service_name}</td>
            <td class="p-3"><span class="status-badge status-${b.status}">${
        b.status
      }</span></td>
            <td class="p-3 text-right">
                <button onclick="quickAction('${
                  b.id
                }', 'delete')" class="text-red-400 hover:text-white px-2"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `
    )
    .join("");
}

window.quickAction = async function (id, action) {
  if (action === "delete") {
    if (confirm("Supprimer ce RDV ?")) {
      await appClient.from("bookings").delete().eq("id", id);
      renderAllBookingsView();
      renderAdminStats();
      if (window.calendar) window.calendar.refetchEvents();
    }
  }
};

window.logout = async function () {
  if (confirm("Se déconnecter ?")) {
    await appClient.auth.signOut();
    window.location.href = "login.html";
  }
};

// =============================================================================
// 6. INITIALISATION GLOBALE (Le moteur)
// =============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Démarrage Fixt...");

  // 1. Initialiser UI Notifications
  window.showNotification = function (msg, type = "success") {
    // Version simplifiée alert si pas de container
    const box = document.getElementById("toast-container");
    if (box) {
      const el = document.createElement("div");
      el.className =
        "bg-slate-800 text-white px-6 py-4 rounded-xl border border-white/10 shadow-xl mb-2 animate-bounce";
      el.innerText = msg;
      box.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    } else {
      alert(msg);
    }
  };

  // 2. Vérifier Auth
  await checkAuth();

  // 3. Page Login
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const btn = loginForm.querySelector("button");

      btn.innerHTML = "Connexion...";
      btn.disabled = true;

      const { error } = await appClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        document.getElementById("login-error").classList.remove("hidden");
        btn.innerHTML = "Se Connecter";
        btn.disabled = false;
      } else {
        window.location.href = "admin.html";
      }
    });
  }

  // 4. Page Booking
  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    // Date min = aujourd'hui
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }

  // 5. Tabs Admin
  window.switchTab = function (tabName) {
    document
      .querySelectorAll(".hidden-view")
      .forEach((el) => (el.style.display = "none"));
    const view = document.getElementById(`view-${tabName}`);
    if (view) view.style.display = "block"; // Force display block via JS direct

    if (tabName === "bookings") renderAllBookingsView();
  };
});
