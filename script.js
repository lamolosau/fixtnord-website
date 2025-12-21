// =============================================================================
// 1. CONFIGURATION & INITIALISATION
// =============================================================================

// CLÉS SUPABASE
const SB_URL = "https://kpndqsranyqwcjzggfyu.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwbmRxc3Jhbnlxd2NqemdnZnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTA5MTEsImV4cCI6MjA3NjUyNjkxMX0.XJ5cj5nrv7VyQsStFe-N6rByU34bmkFMneWj3Jv42yI";

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

const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. UI UTILS (MODALES & NOTIFS)
// =============================================================================

window.showNotification = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return alert(message);

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
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0")
  );
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
};
window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
};

let pendingAction = null;
window.showConfirm = function (message, callback) {
  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.innerText = message;
  pendingAction = callback;
  openModal("modal-confirm");
};

// =============================================================================
// 3. NAVIGATION & SÉCURITÉ
// =============================================================================

window.switchTab = function (tabName) {
  document
    .querySelectorAll('[id^="view-"]')
    .forEach((el) => el.classList.add("hidden-view"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((el) => el.classList.remove("active"));

  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.classList.remove("hidden-view");

  const targetBtn = document.getElementById(`btn-${tabName}`);
  if (targetBtn) targetBtn.classList.add("active");

  if (tabName === "bookings") renderAllBookingsView();
  if (tabName === "services") renderAdminStats();
  if (tabName === "reviews") renderReviewsView();
  if (tabName === "calendar") setTimeout(initAdminCalendar, 100);
};

async function checkAuth() {
  if (!appClient) return;

  const isAdminPage =
    document.getElementById("view-dashboard") ||
    document.querySelector(".glass-sidebar");
  const isLoginPage = document.getElementById("login-form");
  const { data } = await appClient.auth.getSession();
  const session = data?.session;

  if (isAdminPage) {
    if (!session) {
      window.location.href = "login.html";
    } else {
      document.body.style.setProperty("display", "flex", "important");
      renderAdminStats();
      renderAllBookingsView();
      // Listener pour form slot
      const slotForm = document.getElementById("form-edit-slot");
      if (slotForm) slotForm.addEventListener("submit", handleSaveSlot);
    }
  } else if (isLoginPage) {
    if (session) window.location.href = "admin.html";
  }
}

window.logout = function () {
  showConfirm("Voulez-vous vraiment vous déconnecter ?", async () => {
    await appClient.auth.signOut();
    window.location.href = "login.html";
  });
};

// =============================================================================
// 4. LOGIQUE ADMIN - CALENDRIER (FULLCALENDAR)
// =============================================================================
let calendar = null;

async function initAdminCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;
  if (calendar) {
    calendar.render();
    return;
  }

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "fr",
    firstDay: 1,
    slotMinTime: "08:00:00",
    slotMaxTime: "20:00:00",
    allDaySlot: false,
    height: "100%",
    selectable: true,
    editable: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },

    // CRÉATION DE CRÉNEAU AU CLICK/GLISSÉ
    select: async function (info) {
      const { error } = await appClient
        .from("slots")
        .insert([{ start_time: info.startStr, end_time: info.endStr }]);
      if (!error) {
        calendar.refetchEvents();
        showNotification("Créneau disponible ajouté", "info");
      }
      calendar.unselect();
    },

    events: async function (info, successCallback, failureCallback) {
      try {
        // 1. Récupérer les SLOTS (Dispos)
        const { data: slots } = await appClient
          .from("slots")
          .select("*")
          .gte("end_time", info.startStr)
          .lte("start_time", info.endStr);

        // 2. Récupérer les BOOKINGS (Réservations)
        const { data: bookings } = await appClient
          .from("bookings")
          .select("*")
          .gte("end_time", info.startStr)
          .lte("start_time", info.endStr);

        let combinedEvents = [];

        // Affichage des Slots (Vert)
        if (slots)
          slots.forEach((s) => {
            combinedEvents.push({
              id: "slot_" + s.id,
              title: "DISPO",
              start: s.start_time,
              end: s.end_time,
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderColor: "#10b981",
              textColor: "#10b981",
              classNames: ["cursor-pointer"],
              extendedProps: { type: "slot", dbId: s.id },
            });
          });

        // Affichage des RDV (Couleur selon statut)
        if (bookings)
          bookings.forEach((b) => {
            const st = b.status || "pending";
            const colors = STATUS_COLORS[st] || STATUS_COLORS.pending;
            combinedEvents.push({
              id: "booking_" + b.id,
              title: b.customer_name,
              start: b.start_time,
              end: b.end_time,
              backgroundColor: colors.bg,
              borderColor: colors.border,
              textColor: colors.text,
              classNames: ["cursor-pointer"],
              extendedProps: { type: "booking", dbId: b.id },
            });
          });
        successCallback(combinedEvents);
      } catch (e) {
        failureCallback(e);
      }
    },

    eventClick: function (info) {
      const props = info.event.extendedProps;
      if (props.type === "slot") openSlotModal(info.event);
      // Pour les bookings, on pourrait aussi ouvrir une modale de détails ici
    },
  });
  calendar.render();
}

function openSlotModal(event) {
  const props = event.extendedProps;
  document.getElementById("slot-id").value = props.dbId;
  // Conversion Date -> Input DateTimeLocal
  const format = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  document.getElementById("slot-start").value = format(event.start);
  document.getElementById("slot-end").value = format(event.end);
  openModal("modal-slot");
}

window.handleSaveSlot = async function (e) {
  e.preventDefault();
  const id = document.getElementById("slot-id").value;
  const start = new Date(
    document.getElementById("slot-start").value
  ).toISOString();
  const end = new Date(document.getElementById("slot-end").value).toISOString();

  const { error } = await appClient
    .from("slots")
    .update({ start_time: start, end_time: end })
    .eq("id", id);
  if (!error) {
    closeModal("modal-slot");
    if (calendar) calendar.refetchEvents();
    showNotification("Créneau modifié", "success");
  }
};

window.handleDeleteSlot = function () {
  showConfirm("Supprimer ce créneau ?", async () => {
    const id = document.getElementById("slot-id").value;
    const { error } = await appClient.from("slots").delete().eq("id", id);
    if (!error) {
      closeModal("modal-slot");
      if (calendar) calendar.refetchEvents();
      showNotification("Créneau supprimé", "success");
    }
  });
};

// =============================================================================
// 5. LOGIQUE ADMIN - AVIS & AUTRES
// =============================================================================

async function renderReviewsView() {
  const tbody = document.getElementById("reviews-table-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-[#5475FF]"></i></td></tr>';

  const { data: reviews } = await appClient
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if (!reviews || reviews.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center p-4 text-slate-500">Aucun avis.</td></tr>';
    return;
  }

  tbody.innerHTML = reviews
    .map((r) => {
      const stars = Array(5)
        .fill(0)
        .map((_, i) =>
          i < r.rating
            ? '<i class="fa-solid fa-star text-orange-400 text-xs"></i>'
            : '<i class="fa-regular fa-star text-slate-600 text-xs"></i>'
        )
        .join("");
      const statusBadge = r.approved
        ? '<span class="status-badge status-confirmed">Publié</span>'
        : '<span class="status-badge status-pending">Masqué</span>';

      const toggleIcon = r.approved ? "fa-eye-slash" : "fa-check";
      const toggleTitle = r.approved ? "Masquer" : "Publier";

      return `
        <tr class="hover:bg-white/5 transition border-b border-white/5">
            <td class="p-3 text-sm text-slate-400">${new Date(
              r.created_at
            ).toLocaleDateString()}</td>
            <td class="p-3"><div class="font-bold text-white">${
              r.customer_name
            }</div><div class="text-xs text-slate-500">${
        r.car_model || "-"
      }</div></td>
            <td class="p-3"><div class="flex gap-1">${stars}</div></td>
            <td class="p-3 text-sm text-slate-300 italic">"${r.comment}"</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 text-right">
                <button onclick="toggleReviewStatus('${
                  r.id
                }', ${!r.approved})" class="w-8 h-8 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg mr-2" title="${toggleTitle}"><i class="fa-solid ${toggleIcon}"></i></button>
                <button onclick="deleteReview('${
                  r.id
                }')" class="w-8 h-8 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    })
    .join("");
}

window.toggleReviewStatus = async function (id, newStatus) {
  const { error } = await appClient
    .from("reviews")
    .update({ approved: newStatus })
    .eq("id", id);
  if (!error) {
    renderReviewsView();
    showNotification(newStatus ? "Avis publié" : "Avis masqué", "success");
  }
};

window.deleteReview = function (id) {
  showConfirm("Supprimer cet avis ?", async () => {
    await appClient.from("reviews").delete().eq("id", id);
    renderReviewsView();
    showNotification("Avis supprimé", "success");
  });
};

async function renderAdminStats() {
  // Rechargement stats & services comme avant...
  if (document.getElementById("stat-revenue")) {
    const { data: bookings } = await appClient.from("bookings").select("*");
    if (bookings) {
      const total = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
      document.getElementById("stat-revenue").innerText = total + "€";
      document.getElementById("count-rdv").innerText = bookings.length;
    }
  }
  const srvList = document.getElementById("admin-services-list");
  if (srvList) {
    const { data: services } = await appClient
      .from("services")
      .select("*")
      .order("price");
    if (services) {
      if (document.getElementById("count-services"))
        document.getElementById("count-services").innerText = services.length;
      srvList.innerHTML = services
        .map(
          (s) => `
                <div class="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <div><div class="font-bold text-white">${s.name}</div><div class="text-xs text-slate-400">${s.duration} min</div></div>
                    <button onclick="dbDeleteService(${s.id})" class="text-red-400"><i class="fa-solid fa-trash"></i></button>
                </div>`
        )
        .join("");
    }
  }
}

// ... (Le reste des fonctions dbFetchBookings, renderAllBookingsView, handleAddService, etc. restent identiques à la version précédente) ...
async function dbFetchBookings() {
  return await appClient
    .from("bookings")
    .select("*")
    .order("start_time", { ascending: false });
}

async function renderAllBookingsView() {
  const tbody = document.getElementById("all-bookings-table-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-[#5475FF]"></i></td></tr>';
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
            <td class="p-3 text-right"><button onclick="quickAction('${
              b.id
            }', 'delete')" class="text-red-400 hover:text-white px-2"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`
    )
    .join("");
}

window.quickAction = function (id, action) {
  if (action === "delete")
    showConfirm("Supprimer ce RDV ?", async () => {
      await appClient.from("bookings").delete().eq("id", id);
      renderAllBookingsView();
      renderAdminStats();
      if (calendar) calendar.refetchEvents();
    });
};

window.handleAddService = async function (e) {
  e.preventDefault();
  await appClient.from("services").insert([
    {
      name: e.target.name.value,
      price: e.target.price.value,
      duration: e.target.duration.value,
    },
  ]);
  e.target.reset();
  renderAdminStats();
  showNotification("Service ajouté");
};
window.dbDeleteService = function (id) {
  showConfirm("Supprimer ce service ?", async () => {
    await appClient.from("services").delete().eq("id", id);
    renderAdminStats();
  });
};

// =============================================================================
// 6. INITIALISATION
// =============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  const btnConfirm = document.getElementById("btn-confirm-action");
  if (btnConfirm)
    btnConfirm.addEventListener("click", () => {
      if (pendingAction) pendingAction();
      closeModal("modal-confirm");
      pendingAction = null;
    });

  await checkAuth();

  // Login logic
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await appClient.auth.signInWithPassword({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      });
      if (error)
        document.getElementById("login-error").classList.remove("hidden");
      else window.location.href = "admin.html";
    });
  }

  // Client side logic (Booking + Review form)
  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }
});
