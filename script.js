// =============================================================================
// 1. CONFIGURATION
// =============================================================================
const SB_URL = "https://kpndqsranyqwcjzggfyu.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwbmRxc3Jhbnlxd2NqemdnZnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTA5MTEsImV4cCI6MjA3NjUyNjkxMX0.XJ5cj5nrv7VyQsStFe-N6rByU34bmkFMneWj3Jv42yI";

let appClient = null;

try {
  if (window.supabase) {
    appClient = window.supabase.createClient(SB_URL, SB_KEY);
    console.log("✅ Système Fixt connecté.");
  } else {
    console.error("❌ ERREUR: Supabase non chargé.");
  }
} catch (err) {
  console.error("❌ Erreur init:", err);
}

const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. UI UTILS
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
// 3. NAVIGATION
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

// =============================================================================
// 4. AUTH & ADMIN
// =============================================================================
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
      const slotForm = document.getElementById("form-edit-slot");
      if (slotForm) slotForm.addEventListener("submit", handleSaveSlot);
    }
  } else if (isLoginPage && session) {
    window.location.href = "admin.html";
  }
}

window.logout = function () {
  showConfirm("Se déconnecter ?", async () => {
    await appClient.auth.signOut();
    window.location.href = "login.html";
  });
};

// =============================================================================
// 5. CALENDRIER (FULLCALENDAR)
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

    select: async function (info) {
      const { error } = await appClient
        .from("slots")
        .insert([{ start_time: info.startStr, end_time: info.endStr }]);
      if (!error) {
        calendar.refetchEvents();
        showNotification("Créneau ajouté", "info");
      }
      calendar.unselect();
    },

    events: async function (info, successCallback, failureCallback) {
      try {
        const { data: slots } = await appClient
          .from("slots")
          .select("*")
          .gte("end_time", info.startStr)
          .lte("start_time", info.endStr);
        const { data: bookings } = await appClient
          .from("bookings")
          .select("*")
          .gte("end_time", info.startStr)
          .lte("start_time", info.endStr);

        let combined = [];
        if (slots)
          slots.forEach((s) =>
            combined.push({
              id: "slot_" + s.id,
              title: "DISPO",
              start: s.start_time,
              end: s.end_time,
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              borderColor: "#10b981",
              textColor: "#10b981",
              extendedProps: { type: "slot", dbId: s.id },
            })
          );
        if (bookings)
          bookings.forEach((b) => {
            const st = b.status || "pending";
            const c = STATUS_COLORS[st] || STATUS_COLORS.pending;
            combined.push({
              id: "booking_" + b.id,
              title: b.customer_name,
              start: b.start_time,
              end: b.end_time,
              backgroundColor: c.bg,
              borderColor: c.border,
              textColor: c.text,
              extendedProps: { type: "booking", dbId: b.id },
            });
          });
        successCallback(combined);
      } catch (e) {
        failureCallback(e);
      }
    },
    eventClick: function (info) {
      if (info.event.extendedProps.type === "slot") openSlotModal(info.event);
    },
  });
  calendar.render();
}

function openSlotModal(event) {
  document.getElementById("slot-id").value = event.extendedProps.dbId;
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
  const s = new Date(document.getElementById("slot-start").value).toISOString();
  const en = new Date(document.getElementById("slot-end").value).toISOString();
  const { error } = await appClient
    .from("slots")
    .update({ start_time: s, end_time: en })
    .eq("id", id);
  if (!error) {
    closeModal("modal-slot");
    calendar.refetchEvents();
    showNotification("Créneau modifié", "success");
  }
};

window.handleDeleteSlot = function () {
  // CORRECTION ICI : On ferme d'abord la modale d'édition pour éviter le conflit
  closeModal("modal-slot");
  // Ensuite on demande confirmation
  showConfirm("Supprimer ce créneau ?", async () => {
    const id = document.getElementById("slot-id").value;
    const { error } = await appClient.from("slots").delete().eq("id", id);
    if (!error) {
      if (calendar) calendar.refetchEvents();
      showNotification("Créneau supprimé", "success");
    }
  });
};

// =============================================================================
// 6. DONNÉES & CRUD
// =============================================================================
async function fetchServices() {
  const { data } = await appClient.from("services").select("*").order("price");
  return data || [];
}

async function renderAdminStats() {
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
    const services = await fetchServices();
    if (document.getElementById("count-services"))
      document.getElementById("count-services").innerText = services.length;
    srvList.innerHTML = services
      .map(
        (s) => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div><div class="font-bold text-white">${s.name}</div><div class="text-xs text-slate-400">${s.duration} min</div></div>
                <div class="flex gap-3 items-center"><span class="text-[#5475FF] font-bold">${s.price}€</span><button onclick="dbDeleteService(${s.id})" class="text-red-400"><i class="fa-solid fa-trash"></i></button></div>
            </div>`
      )
      .join("");
  }
}

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
    .map(
      (r) => `
        <tr class="hover:bg-white/5 transition border-b border-white/5">
            <td class="p-3 text-sm text-slate-400">${new Date(
              r.created_at
            ).toLocaleDateString()}</td>
            <td class="p-3"><div class="font-bold text-white">${
              r.customer_name
            }</div></td>
            <td class="p-3 text-orange-400 font-bold">${r.rating}/5</td>
            <td class="p-3 text-sm text-slate-300 italic">"${r.comment}"</td>
            <td class="p-3">${
              r.approved
                ? '<span class="status-badge status-confirmed">Publié</span>'
                : '<span class="status-badge status-pending">Masqué</span>'
            }</td>
            <td class="p-3 text-right">
                <button onclick="toggleReviewStatus('${
                  r.id
                }', ${!r.approved})" class="mr-2 text-blue-400"><i class="fa-solid ${
        r.approved ? "fa-eye-slash" : "fa-check"
      }"></i></button>
                <button onclick="deleteReview('${
                  r.id
                }')" class="text-red-400"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`
    )
    .join("");
}

window.toggleReviewStatus = async function (id, newStatus) {
  await appClient.from("reviews").update({ approved: newStatus }).eq("id", id);
  renderReviewsView();
};
window.deleteReview = function (id) {
  showConfirm("Supprimer ?", async () => {
    await appClient.from("reviews").delete().eq("id", id);
    renderReviewsView();
  });
};

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
    showConfirm("Supprimer ?", async () => {
      await appClient.from("bookings").delete().eq("id", id);
      renderAllBookingsView();
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
// 7. CLIENT SIDE (BOOKING)
// =============================================================================
let currentService = null;
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
  document
    .getElementById("date-step")
    .classList.remove("opacity-50", "pointer-events-none");
  if (document.getElementById("date-picker").value) onDateChanged();
};

async function renderServiceSelector() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;
  container.innerHTML =
    '<div class="text-center py-4 text-blue-300"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';

  // Si la liste est vide, on l'affiche clairement
  const services = await fetchServices();
  if (services.length === 0) {
    container.innerHTML =
      "<p class='text-center text-red-400 bg-red-50 p-2 rounded'>Aucun service disponible.<br><span class='text-xs text-slate-500'>Ajoutez-en via le panel Admin.</span></p>";
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

// --- CORRECTION CRITIQUE DU DÉCOUPAGE DES CRÉNEAUX ---
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

  const startDay = new Date(dateInput);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(dateInput);
  endDay.setHours(23, 59, 59, 999);

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
      '<div class="col-span-3 text-center text-slate-400 py-2">Aucune disponibilité ce jour.</div>';
    return;
  }

  // --- LOGIQUE DÉCOUPAGE ---
  let availableTimes = [];
  const step = 30; // 30 minutes
  const duration = parseInt(currentService.duration) || 60; // Sécurité

  rawSlots.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  // Pour chaque grand créneau ouvert par l'admin (ex: 8h-20h)
  rawSlots.forEach((slot) => {
    let cursor = new Date(slot.start_time);
    let limit = new Date(slot.end_time);

    // On avance par tranche de 30min
    while (cursor.getTime() + duration * 60000 <= limit.getTime()) {
      const startAttempt = new Date(cursor);
      const endAttempt = new Date(cursor.getTime() + duration * 60000);

      // On vérifie si ÇA TOUCHE un RDV existant
      const isBusy = busyBookings.some((b) => {
        const bStart = new Date(b.start_time);
        const bEnd = new Date(b.end_time);
        // Chevauchement : Début < FinRDV ET Fin > DébutRDV
        return startAttempt < bEnd && endAttempt > bStart;
      });

      if (!isBusy) {
        const label = cursor.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        if (!availableTimes.some((t) => t.label === label)) {
          availableTimes.push({ label, iso: startAttempt.toISOString() });
        }
      }
      cursor.setMinutes(cursor.getMinutes() + step);
    }
  });

  if (availableTimes.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-orange-400 py-2">Complet.</div>';
  } else {
    // Tri final et affichage
    availableTimes.sort((a, b) => a.label.localeCompare(b.label));
    container.innerHTML = availableTimes
      .map(
        (t) =>
          `<div class="time-slot" onclick="selectTime('${t.label}', '${t.iso}', this)">${t.label}</div>`
      )
      .join("");
  }

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
  if (!window.selectedSlotIso) return;
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

document.addEventListener("DOMContentLoaded", async () => {
  const btnConfirm = document.getElementById("btn-confirm-action");
  if (btnConfirm)
    btnConfirm.addEventListener("click", () => {
      if (pendingAction) pendingAction();
      closeModal("modal-confirm");
      pendingAction = null;
    });
  await checkAuth();
  if (document.getElementById("login-form"))
    document
      .getElementById("login-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await appClient.auth.signInWithPassword({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        });
        if (error)
          document.getElementById("login-error").classList.remove("hidden");
        else window.location.href = "admin.html";
      });
  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }
});
