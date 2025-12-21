// js/app-admin.js
import { supabase } from "./config.js";
import { checkAuth, logout } from "./auth.js";
import { showNotification, openModal, closeModal } from "./utils.js";

// --- CONSTANTES & ETAT ---
const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#10b981", border: "#059669", text: "#fff" },
};

let revenueChart = null;
let calendar = null;

// --- FONCTIONS DE NAVIGATION ---

function switchTab(tabName) {
  localStorage.setItem("activeAdminTab", tabName);

  // Masquer toutes les vues
  document
    .querySelectorAll('[id^="view-"]')
    .forEach((el) => el.classList.add("hidden-view"));

  // Désactiver tous les boutons (Desktop + Mobile)
  document.querySelectorAll(".nav-btn, .mob-nav-btn").forEach((el) => {
    el.classList.remove("active", "text-[#5475FF]", "bg-white/5"); // Reset styles desktop/mobile
    if (el.classList.contains("mob-nav-btn"))
      el.classList.add("text-slate-500"); // Reset mobile specific
  });

  // Afficher la vue cible
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.classList.remove("hidden-view");

  // Activer bouton Desktop
  const targetBtn = document.getElementById(`btn-${tabName}`);
  if (targetBtn) targetBtn.classList.add("active");

  // Activer bouton Mobile (recherche par attribut data-tab)
  const mobileBtn = document.querySelector(
    `.mob-nav-btn[data-tab="${tabName}"]`
  );
  if (mobileBtn) {
    mobileBtn.classList.remove("text-slate-500");
    mobileBtn.classList.add("text-[#5475FF]"); // Couleur active mobile
  }

  // Charger les données spécifiques (reste inchangé)
  if (tabName === "bookings") renderAllBookingsView();
  if (tabName === "services") renderAdminStats();
  if (tabName === "reviews") renderReviewsView();
  if (tabName === "dashboard") renderAdminStats();
  if (tabName === "calendar") {
    setTimeout(() => {
      initAdminCalendar();
      if (calendar) {
        calendar.updateSize();
        // Optionnel: Passer en vue journée sur mobile
        if (window.innerWidth < 768) calendar.changeView("timeGridDay");
        else calendar.changeView("timeGridWeek");
      }
    }, 50);
  }
}

// --- DASHBOARD & STATS ---

async function renderAdminStats() {
  if (!document.getElementById("stat-revenue")) return;

  const { data: bookings } = await supabase.from("bookings").select("*");
  const { data: reviews } = await supabase.from("reviews").select("*");
  const { data: services } = await supabase.from("services").select("*");

  if (!bookings) return;

  // Calculs Stats
  const totalRevenue = bookings.reduce(
    (sum, b) => sum + (parseFloat(b.price) || 0),
    0
  );
  const finishedCount = bookings.filter((b) => b.status === "finished").length;
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const avgBasket =
    bookings.length > 0 ? Math.round(totalRevenue / bookings.length) : 0;

  let avgRating = 0;
  if (reviews && reviews.length > 0) {
    const totalStars = reviews.reduce((sum, r) => sum + r.rating, 0);
    avgRating = (totalStars / reviews.length).toFixed(1);
  }

  // Mise à jour UI
  document.getElementById("stat-revenue").innerText = totalRevenue + "€";
  document.getElementById(
    "stat-avg-cart"
  ).innerText = `Panier moyen: ${avgBasket}€`;
  document.getElementById("stat-finished").innerText = finishedCount;
  document.getElementById("stat-pending").innerText = pendingCount;
  document.getElementById("stat-rating").innerText = avgRating;
  if (document.getElementById("stat-review-count"))
    document.getElementById("stat-review-count").innerText = `${
      reviews ? reviews.length : 0
    } avis reçus`;

  // Graphique (Chart.js)
  const months = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Juin",
    "Juil",
    "Août",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  let monthlyData = new Array(12).fill(0);
  bookings.forEach((b) => {
    const d = new Date(b.start_time);
    monthlyData[d.getMonth()] += parseFloat(b.price) || 0;
  });

  const ctx = document.getElementById("revenueChart");
  if (ctx) {
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Revenus (€)",
            data: monthlyData,
            borderColor: "#5475FF",
            backgroundColor: "rgba(84, 117, 255, 0.1)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#5475FF",
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#94a3b8" },
          },
          x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
        },
      },
    });
  }

  // Liste Dernières Réservations
  const latestTable = document.getElementById("latest-bookings-body");
  if (latestTable) {
    const latest = [...bookings]
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      .slice(0, 5);
    latestTable.innerHTML = latest
      .map(
        (b) => `
            <tr class="border-b border-white/5 last:border-0 hover:bg-white/5 transition">
                <td class="p-3 text-slate-400 text-sm">${new Date(
                  b.start_time
                ).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}</td>
                <td class="p-3 font-bold text-white">${b.customer_name}</td>
                <td class="p-3 text-sm text-slate-300">${b.service_name}</td>
                <td class="p-3"><span class="status-badge status-${b.status}">${
          b.status
        }</span></td>
                <td class="p-3 font-bold text-[#5475FF]">${b.price}€</td>
            </tr>`
      )
      .join("");
  }

  // Liste Services (Admin)
  const srvList = document.getElementById("admin-services-list");
  if (srvList && services) {
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

  // Top Services
  // (Code simplifié pour brièveté, réutilise la logique précédente si besoin)
  const serviceCounts = {};
  bookings.forEach((b) => {
    serviceCounts[b.service_name] = (serviceCounts[b.service_name] || 0) + 1;
  });
  const sortedServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const topServicesEl = document.getElementById("top-services-list");
  if (topServicesEl) {
    topServicesEl.innerHTML = sortedServices.length
      ? sortedServices
          .map(
            ([name, count], index) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-500/20 text-[#5475FF] flex items-center justify-center font-bold text-sm">#${
                      index + 1
                    }</div>
                    <div class="text-white font-bold text-sm">${name}</div>
                </div>
                <div class="text-xs text-slate-400 font-bold">${count} ventes</div>
            </div>`
          )
          .join("")
      : '<div class="text-slate-500 italic">Pas assez de données.</div>';
  }
}

// --- CALENDRIER ---

async function initAdminCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;
  if (calendar) {
    calendar.render();
    calendar.updateSize();
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
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },

    select: async function (info) {
      const { error } = await supabase
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
        const { data: slots } = await supabase
          .from("slots")
          .select("*")
          .gte("end_time", info.startStr)
          .lte("start_time", info.endStr);
        const { data: bookings } = await supabase
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
              extendedProps: {
                type: "booking",
                dbId: b.id,
                email: b.email,
                phone: b.phone,
                car: b.car_model,
                price: b.price,
                service: b.service_name,
                status: st,
                address: b.address,
              },
            });
          });
        successCallback(combined);
      } catch (e) {
        failureCallback(e);
      }
    },
    eventClick: function (info) {
      const props = info.event.extendedProps;
      if (props.type === "slot") openSlotModal(info.event);
      else if (props.type === "booking") openBookingModal(info.event);
    },
  });
  calendar.render();
}

// --- MODALES ACTIONS ---

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

function openBookingModal(event) {
  const props = event.extendedProps;
  document.getElementById("booking-id").value = props.dbId;
  document.getElementById("booking-client").innerText = event.title;
  document.getElementById("booking-email").innerText =
    props.email || "Non renseigné";
  document.getElementById("booking-phone").innerText =
    props.phone || "Non renseigné";
  document.getElementById("booking-car").innerText = props.car || "N/A";
  document.getElementById("booking-price").innerText =
    (props.price || "0") + "€";
  document.getElementById("booking-service").innerText = props.service || "...";
  document.getElementById("booking-time").innerText =
    event.start.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const addrEl = document.getElementById("booking-address");
  if (addrEl) addrEl.innerText = props.address || "Adresse non renseignée";

  const statusMap = {
    pending: "En attente ⏳",
    confirmed: "Confirmé ✅",
    finished: "Terminé 🏁",
  };
  const st = props.status || "pending";
  const txt = document.getElementById("modal-status-text");
  txt.innerText = statusMap[st];
  txt.className = `text-xs font-bold uppercase tracking-wider ${
    st === "pending"
      ? "text-orange-400"
      : st === "confirmed"
      ? "text-blue-400"
      : "text-emerald-500"
  }`;

  const btnConfirm = document.getElementById("btn-modal-confirm");
  const btnFinish = document.getElementById("btn-modal-finish");

  if (btnConfirm) btnConfirm.classList.add("hidden");
  if (btnFinish) btnFinish.classList.add("hidden");

  if (st === "pending" && btnConfirm) btnConfirm.classList.remove("hidden");
  else if (st === "confirmed" && btnFinish)
    btnFinish.classList.remove("hidden");

  openModal("modal-booking");
}

async function handleSaveSlot(e) {
  e.preventDefault();
  const id = document.getElementById("slot-id").value;
  const s = new Date(document.getElementById("slot-start").value).toISOString();
  const en = new Date(document.getElementById("slot-end").value).toISOString();
  const { error } = await supabase
    .from("slots")
    .update({ start_time: s, end_time: en })
    .eq("id", id);
  if (!error) {
    closeModal("modal-slot");
    calendar.refetchEvents();
    showNotification("Créneau modifié", "success");
  }
}

function handleDeleteSlot() {
  closeModal("modal-slot");
  // Utilise showConfirm défini globalement ou réimplémente le simple
  if (confirm("Supprimer ce créneau ?")) {
    const id = document.getElementById("slot-id").value;
    supabase
      .from("slots")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (!error) {
          calendar.refetchEvents();
          showNotification("Créneau supprimé", "success");
        }
      });
  }
}

// --- GESTION RESERVATIONS (TABLEAU) ---

async function renderAllBookingsView() {
  const tbody = document.getElementById("all-bookings-table-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-[#5475FF]"></i></td></tr>';
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .order("start_time", { ascending: false });

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
            <td class="p-3 text-center">
                <button onclick="quickAction('${
                  b.id
                }', 'delete')" class="text-red-400 hover:text-white px-2"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`
    )
    .join("");
}

// --- GESTION AVIS ---

async function renderReviewsView() {
  const tbody = document.getElementById("reviews-table-body");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-[#5475FF]"></i></td></tr>';
  const { data: reviews } = await supabase
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
            <td class="p-3 text-center">
                <button onclick="toggleReviewStatus('${
                  r.id
                }', ${!r.approved})" class="mr-2 text-blue-400 hover:text-white transition"><i class="fa-solid ${
        r.approved ? "fa-eye-slash" : "fa-check"
      }"></i></button>
                <button onclick="deleteReview('${
                  r.id
                }')" class="text-red-400 hover:text-white transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`
    )
    .join("");
}

// --- ACTIONS GLOBALES (Attachées à window pour le HTML onclick) ---

async function handleChangeStatus(newStatus) {
  const id = document.getElementById("booking-id").value;
  const { error } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", id);
  if (!error) {
    closeModal("modal-booking");
    if (calendar) calendar.refetchEvents();
    renderAllBookingsView();
    renderAdminStats();
    showNotification("Statut mis à jour");
  }
}

function handleDeleteBookingFromModal() {
  closeModal("modal-booking");
  if (confirm("Supprimer ce RDV ?")) {
    const id = document.getElementById("booking-id").value;
    supabase
      .from("bookings")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (!error) {
          if (calendar) calendar.refetchEvents();
          renderAllBookingsView();
          renderAdminStats();
          showNotification("RDV supprimé");
        }
      });
  }
}

function quickAction(id, action) {
  if (action === "delete") {
    if (confirm("Supprimer ?")) {
      supabase
        .from("bookings")
        .delete()
        .eq("id", id)
        .then(() => renderAllBookingsView());
    }
  }
}

async function toggleReviewStatus(id, newStatus) {
  await supabase.from("reviews").update({ approved: newStatus }).eq("id", id);
  renderReviewsView();
}

function deleteReview(id) {
  if (confirm("Supprimer ?")) {
    supabase
      .from("reviews")
      .delete()
      .eq("id", id)
      .then(() => renderReviewsView());
  }
}

async function handleAddService(e) {
  e.preventDefault();
  await supabase.from("services").insert([
    {
      name: e.target.name.value,
      price: e.target.price.value,
      duration: e.target.duration.value,
    },
  ]);
  e.target.reset();
  renderAdminStats();
  showNotification("Service ajouté");
}

function dbDeleteService(id) {
  if (confirm("Supprimer ce service ?")) {
    supabase
      .from("services")
      .delete()
      .eq("id", id)
      .then(() => renderAdminStats());
  }
}

// --- EXPORTATION VERS WINDOW (Pour que le HTML puisse cliquer) ---
window.switchTab = switchTab;
window.logout = logout;
window.closeModal = closeModal;
window.renderAllBookingsView = renderAllBookingsView;
window.renderReviewsView = renderReviewsView;
window.handleAddService = handleAddService;
window.dbDeleteService = dbDeleteService;
window.handleSaveSlot = handleSaveSlot;
window.handleDeleteSlot = handleDeleteSlot;
window.handleChangeStatus = handleChangeStatus;
window.handleDeleteBookingFromModal = handleDeleteBookingFromModal;
window.toggleReviewStatus = toggleReviewStatus;
window.deleteReview = deleteReview;
window.quickAction = quickAction;

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();

  // Attachement manuel du form slot s'il existe (pour éviter le inline onsubmit si possible)
  const slotForm = document.getElementById("form-edit-slot");
  if (slotForm) slotForm.addEventListener("submit", handleSaveSlot);

  // Restaurer l'onglet
  const lastTab = localStorage.getItem("activeAdminTab") || "dashboard";
  switchTab(lastTab);
});
