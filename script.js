// =============================================================================
// 1. CONFIGURATION & INITIALISATION SUPABASE
// =============================================================================
const SUPABASE_URL = "https://kpndqsranyqwcjzggfyu.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwbmRxc3Jhbnlxd2NqemdnZnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NTA5MTEsImV4cCI6MjA3NjUyNjkxMX0.XJ5cj5nrv7VyQsStFe-N6rByU34bmkFMneWj3Jv42yI";

let supabase;
if (window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("✅ Supabase connecté.");
} else {
  console.error("❌ ERREUR: Supabase SDK manquant.");
}

const SHOP_CONFIG = { stepMinutes: 30 };

const STATUS_COLORS = {
  pending: { bg: "#f59e0b", border: "#d97706", text: "#fff" },
  confirmed: { bg: "#3b82f6", border: "#2563eb", text: "#fff" },
  finished: { bg: "#64748b", border: "#475569", text: "#cbd5e1" },
};

// =============================================================================
// 2. UI UTILS : NOTIFICATIONS & MODALES
// =============================================================================

window.showNotification = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return alert(message);

  const styles = {
    success: {
      bg: "bg-emerald-500/90",
      border: "border-emerald-400",
      icon: '<i class="fa-solid fa-check-circle text-xl"></i>',
    },
    error: {
      bg: "bg-red-500/90",
      border: "border-red-400",
      icon: '<i class="fa-solid fa-circle-exclamation text-xl"></i>',
    },
    info: {
      bg: "bg-blue-500/90",
      border: "border-blue-400",
      icon: '<i class="fa-solid fa-circle-info text-xl"></i>',
    },
  };

  const style = styles[type] || styles.success;
  const toast = document.createElement("div");

  toast.className = `pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-xl border ${style.border} ${style.bg} text-white shadow-2xl backdrop-blur-md transform transition-all duration-500 translate-y-10 opacity-0`;
  toast.innerHTML = `<div>${style.icon}</div><div class="font-bold text-sm shadow-black drop-shadow-md">${message}</div>`;

  container.appendChild(toast);
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0")
  );
  setTimeout(() => {
    toast.classList.add("translate-y-10", "opacity-0");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

let pendingAction = null;
window.showConfirm = function (message, callback) {
  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.innerText = message;
  pendingAction = callback;
  openModal("modal-confirm");
};

window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
};
window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
};

// =============================================================================
// 3. DATABASE LAYER
// =============================================================================

async function dbCreateSlot(startIso, endIso) {
  const { data, error } = await supabase
    .from("slots")
    .insert([{ start_time: startIso, end_time: endIso }])
    .select();
  return { data, error };
}
async function dbDeleteSlot(id) {
  const { error } = await supabase.from("slots").delete().eq("id", id);
  return error;
}
async function dbUpdateSlotTime(id, newStartIso, newEndIso) {
  const { error } = await supabase
    .from("slots")
    .update({ start_time: newStartIso, end_time: newEndIso })
    .eq("id", id);
  return error;
}

async function dbAddBooking(bookingData) {
  return await supabase
    .from("bookings")
    .insert([{ ...bookingData, status: "pending" }])
    .select();
}
async function dbDeleteBooking(id) {
  return await supabase.from("bookings").delete().eq("id", id);
}
async function dbUpdateBookingStatus(id, status) {
  return await supabase
    .from("bookings")
    .update({ status: status })
    .eq("id", id);
}
async function dbFetchBookings() {
  return await supabase
    .from("bookings")
    .select("*")
    .order("start_time", { ascending: false });
}

async function fetchServices() {
  const { data } = await supabase.from("services").select("*").order("price");
  return data || [];
}
async function dbAddService(name, price, duration) {
  return await supabase.from("services").insert([{ name, price, duration }]);
}
async function dbDeleteService(id) {
  showConfirm("Supprimer ce service ?", async () => {
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (!error) {
      window.location.reload();
    } else {
      showNotification("Erreur suppression", "error");
    }
  });
}

// =============================================================================
// 4. CLIENT SIDE (BOOKING)
// =============================================================================
let currentService = null;

async function renderServiceSelector() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;

  container.innerHTML =
    '<div class="text-center py-4 text-blue-200"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
  const services = await fetchServices();

  if (services.length === 0) {
    container.innerHTML =
      "<p class='text-sm text-red-400'>Aucun service configuré.</p>";
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
        </div>
    `;
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
  document.getElementById("final-service-id").value = id;
  document.getElementById("final-price").value = price;

  document
    .getElementById("date-step")
    .classList.remove("opacity-50", "pointer-events-none");
  document.getElementById("slots-container").innerHTML =
    '<div class="col-span-3 text-sm text-blue-300 italic">Veuillez choisir une date</div>';

  if (document.getElementById("date-picker").value) onDateChanged();
};

window.onDateChanged = async function () {
  const dateInput = document.getElementById("date-picker").value;
  if (!dateInput || !currentService) return;

  const container = document.getElementById("slots-container");
  const loader = document.getElementById("slots-loader");

  document
    .getElementById("slots-step")
    .classList.remove("opacity-50", "pointer-events-none");
  if (loader) loader.classList.remove("hidden");
  container.innerHTML = "";

  const startDay = new Date(dateInput);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(dateInput);
  endDay.setHours(23, 59, 59, 999);

  const { data: rawSlots } = await supabase
    .from("slots")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());
  const { data: busyBookings } = await supabase
    .from("bookings")
    .select("*")
    .gte("end_time", startDay.toISOString())
    .lte("start_time", endDay.toISOString());

  if (loader) loader.classList.add("hidden");

  if (!rawSlots || rawSlots.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-blue-200 bg-white/5 rounded-lg py-3 text-sm">Aucune disponibilité.</div>';
    return;
  }

  const mergedSlots = mergeContiguousSlots(rawSlots);
  let finalOptions = [];
  const now = new Date();

  for (let slot of mergedSlots) {
    let cursor = new Date(slot.start);
    let zoneEnd = new Date(slot.end);

    while (
      cursor.getTime() + currentService.duration * 60000 <=
      zoneEnd.getTime()
    ) {
      const candidateStart = new Date(cursor);
      const candidateEnd = new Date(
        cursor.getTime() + currentService.duration * 60000
      );

      if (candidateStart > now) {
        const isClash = busyBookings.some((booking) => {
          const bStart = new Date(booking.start_time);
          const bEnd = new Date(booking.end_time);
          return candidateStart < bEnd && candidateEnd > bStart;
        });

        if (!isClash) {
          finalOptions.push(
            candidateStart.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        }
      }
      cursor.setMinutes(cursor.getMinutes() + SHOP_CONFIG.stepMinutes);
    }
  }

  finalOptions = [...new Set(finalOptions)].sort();

  if (finalOptions.length === 0) {
    container.innerHTML =
      '<div class="col-span-3 text-center text-orange-300 bg-orange-500/10 rounded-lg py-3 text-sm">Complet.</div>';
  } else {
    container.innerHTML = finalOptions
      .map(
        (timeStr) =>
          `<div class="time-slot" onclick="selectTime('${timeStr}', this)">${timeStr}</div>`
      )
      .join("");
  }

  const [y, m, d] = dateInput.split("-");
  document.getElementById("summary-date").innerText = new Date(
    y,
    m - 1,
    d
  ).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  document.getElementById("final-date").value = dateInput;
};

function mergeContiguousSlots(slots) {
  if (!slots || slots.length === 0) return [];
  slots.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  let merged = [];
  let current = {
    start: new Date(slots[0].start_time),
    end: new Date(slots[0].end_time),
  };

  for (let i = 1; i < slots.length; i++) {
    let nextStart = new Date(slots[i].start_time);
    let nextEnd = new Date(slots[i].end_time);
    if (nextStart <= current.end) {
      if (nextEnd > current.end) current.end = nextEnd;
    } else {
      merged.push(current);
      current = { start: nextStart, end: nextEnd };
    }
  }
  merged.push(current);
  return merged;
}

window.selectTime = function (timeStr, element) {
  document
    .querySelectorAll(".time-slot")
    .forEach((el) => el.classList.remove("selected"));
  element.classList.add("selected");
  document.getElementById("final-time").value = timeStr;
  document.getElementById("summary-time").innerText = " à " + timeStr;

  const btn = document.getElementById("pay-btn");
  btn.disabled = false;
  btn.classList.remove("opacity-50", "cursor-not-allowed");
};

// --- MODIFICATION : Suppression de l'envoi d'email ---
window.handlePayment = async function (e) {
  e.preventDefault();
  const btn = document.getElementById("pay-btn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
  btn.disabled = true;

  const [y, m, d] = document
    .getElementById("final-date")
    .value.split("-")
    .map(Number);
  const [hours, minutes] = document
    .getElementById("final-time")
    .value.split(":")
    .map(Number);
  const start = new Date(y, m - 1, d, hours, minutes);
  const end = new Date(start.getTime() + currentService.duration * 60000);

  // On stocke l'email en base mais on n'envoie RIEN
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
  };

  const { error } = await dbAddBooking(bookingData);

  if (!error) {
    showNotification("Demande enregistrée avec succès !", "success");
    setTimeout(() => (window.location.href = "index.html"), 2000);
  } else {
    showNotification("Erreur: " + error.message, "error");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// =============================================================================
// 5. ADMIN SIDE (AUTH & LOGIC)
// =============================================================================
let calendar = null;

// --- MODIFICATION : checkAuth Robuste ---
async function checkAuth() {
  // On récupère la session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // DÉTECTION : Sommes-nous sur la page Admin ?
  // On cherche un élément unique au dashboard (la sidebar ou le conteneur principal)
  const isAdminPage =
    document.getElementById("view-dashboard") ||
    document.querySelector(".glass-sidebar");

  if (isAdminPage) {
    if (!session) {
      console.warn("⛔ Accès refusé, redirection vers login...");
      window.location.href = "login.html";
    } else {
      console.log("✅ Admin connecté :", session.user.email);
    }
  }

  // DÉTECTION : Sommes-nous sur la page Login ?
  const isLoginPage = document.getElementById("login-form");
  if (isLoginPage) {
    if (session) {
      console.log("🔄 Déjà connecté, redirection vers admin...");
      window.location.href = "admin.html";
    }
  }
}

// --- MODIFICATION : Logout Robuste ---
window.logout = async function () {
  showConfirm("Se déconnecter ?", async () => {
    // Tentative de déconnexion propre
    await supabase.auth.signOut();

    // Nettoyage et redirection forcée
    localStorage.clear();
    window.location.href = "login.html";
  });
};

async function renderAdminStats() {
  const { data: bookings } = await supabase.from("bookings").select("*");
  if (!bookings) return;

  document.getElementById("stat-revenue").innerText =
    bookings.reduce((sum, b) => sum + (b.price || 0), 0) + "€";
  document.getElementById("count-rdv").innerText = bookings.length;

  const list = document.getElementById("bookings-list");
  if (list) {
    const latest = bookings
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      .slice(0, 5);
    list.innerHTML = latest.length
      ? latest
          .map(
            (b) => `
            <div class="p-4 flex justify-between items-center hover:bg-white/5 transition border-b border-white/5 last:border-0">
                <div>
                    <div class="font-bold text-white">${b.customer_name}</div>
                    <div class="text-xs text-slate-500">${new Date(
                      b.start_time
                    ).toLocaleDateString()}</div>
                </div>
                <div class="text-emerald-400 font-bold text-sm">+${
                  b.price
                }€</div>
            </div>`
          )
          .join("")
      : '<div class="p-8 text-center text-slate-500">Aucun RDV</div>';
  }
}

window.renderAllBookingsView = async function () {
  const tbody = document.getElementById("all-bookings-table-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center p-4 text-slate-500"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
  const { data: bookings } = await dbFetchBookings();

  if (!bookings || bookings.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="text-center p-4 text-slate-500">Aucun rendez-vous.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings
    .map((b) => {
      const st = b.status || "pending";
      const dateStr = new Date(b.start_time).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      let actionsHtml = "";
      if (st === "pending") {
        actionsHtml = `
                <button onclick="quickAction('${b.id}', 'confirm')" class="btn-action bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white" title="Confirmer"><i class="fa-solid fa-check"></i></button>
                <button onclick="quickAction('${b.id}', 'delete')" class="btn-action bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white" title="Annuler"><i class="fa-solid fa-xmark"></i></button>`;
      } else if (st === "confirmed") {
        actionsHtml = `
                <button onclick="quickAction('${b.id}', 'finish')" class="btn-action bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white" title="Terminer"><i class="fa-solid fa-flag-checkered"></i></button>
                <button onclick="quickAction('${b.id}', 'delete')" class="btn-action bg-slate-700 text-slate-400 hover:bg-red-500 hover:text-white" title="Supprimer"><i class="fa-solid fa-trash"></i></button>`;
      } else {
        actionsHtml = `<button onclick="quickAction('${b.id}', 'delete')" class="btn-action bg-slate-800 text-slate-500 hover:bg-red-500 hover:text-white" title="Supprimer"><i class="fa-solid fa-trash"></i></button>`;
      }

      return `
        <tr>
            <td class="font-medium text-white">${dateStr}</td>
            <td><div class="text-white font-bold">${
              b.customer_name
            }</div><div class="text-xs text-slate-500">${
        b.email || "Sans email"
      }</div></td>
            <td>${b.service_name}</td>
            <td><span class="status-badge status-${st}">${st}</span></td>
            <td class="text-right py-4">${actionsHtml}</td>
        </tr>`;
    })
    .join("");
};

// --- MODIFICATION : Suppression envoi email ---
window.quickAction = async function (id, action) {
  if (action === "delete") {
    showConfirm("Supprimer/Annuler ce RDV ?", async () => {
      await dbDeleteBooking(id);
      renderAllBookingsView();
      renderAdminStats();
      if (calendar) calendar.refetchEvents();
      showNotification("Rendez-vous supprimé.", "success");
    });
  } else if (action === "confirm") {
    await dbUpdateBookingStatus(id, "confirmed");
    renderAllBookingsView();
    renderAdminStats();
    if (calendar) calendar.refetchEvents();
    showNotification("Rendez-vous confirmé.", "success");
  } else if (action === "finish") {
    await dbUpdateBookingStatus(id, "finished");
    renderAllBookingsView();
    renderAdminStats();
    if (calendar) calendar.refetchEvents();
    showNotification("Rendez-vous terminé.", "success");
  }
};

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
      const { error } = await dbCreateSlot(info.startStr, info.endStr);
      if (!error) {
        calendar.refetchEvents();
        showNotification("Créneau disponible ajouté", "info");
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

        let combinedEvents = [];
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
              extendedProps: {
                type: "booking",
                dbId: b.id,
                email: b.email,
                phone: b.phone,
                car: b.car_model,
                price: b.price,
                service: b.service_name,
                status: st,
              },
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
      else if (props.type === "booking") openBookingModal(info.event);
    },
  });
  calendar.render();
}

function openSlotModal(event) {
  const props = event.extendedProps;
  document.getElementById("slot-id").value = props.dbId;
  document.getElementById("slot-start").value = new Date(
    event.start.getTime() - event.start.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);
  document.getElementById("slot-end").value = new Date(
    event.end.getTime() - event.end.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);
  openModal("modal-slot");
}

window.handleSaveSlot = async function (e) {
  e.preventDefault();
  const id = document.getElementById("slot-id").value;
  const start = new Date(
    document.getElementById("slot-start").value
  ).toISOString();
  const end = new Date(document.getElementById("slot-end").value).toISOString();
  const err = await dbUpdateSlotTime(id, start, end);
  if (!err) {
    closeModal("modal-slot");
    calendar.refetchEvents();
    showNotification("Créneau modifié", "success");
  }
};

window.handleDeleteSlot = function () {
  showConfirm("Supprimer ce créneau ?", async () => {
    const id = document.getElementById("slot-id").value;
    const err = await dbDeleteSlot(id);
    if (!err) {
      closeModal("modal-slot");
      calendar.refetchEvents();
      showNotification("Créneau supprimé", "success");
    }
  });
};

function openBookingModal(event) {
  const props = event.extendedProps;

  document.getElementById("booking-id").value = props.dbId;
  document.getElementById("booking-client").innerText = event.title;

  const email = props.email || "Non renseigné";
  document.getElementById("booking-email").innerText = email;
  const mailLink = document.getElementById("booking-email-link");
  if (mailLink) mailLink.href = email.includes("@") ? `mailto:${email}` : "#";

  document.getElementById("booking-phone").innerText = props.phone || "N/A";
  document.getElementById("booking-car").innerText = props.car || "N/A";
  document.getElementById("booking-price").innerText =
    (props.price || "0") + "€";
  document.getElementById("booking-service").innerText = props.service || "...";

  const timeStr = event.start.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.getElementById("booking-time").innerText = timeStr;

  const statusMap = {
    pending: "En attente ⏳",
    confirmed: "Confirmé ✅",
    finished: "Terminé 🏁",
  };
  const st = props.status || "pending";
  const statusTxt = document.getElementById("modal-status-text");
  statusTxt.innerText = statusMap[st];
  statusTxt.className = `text-xs font-bold uppercase tracking-wider ${
    st === "pending"
      ? "text-orange-400"
      : st === "confirmed"
      ? "text-blue-400"
      : "text-slate-500"
  }`;

  openModal("modal-booking");
}

// --- MODIFICATION : Suppression envoi email ---
window.handleChangeStatus = async function (newStatus) {
  const id = document.getElementById("booking-id").value;
  if (!id) return;

  const btnId = newStatus === "confirmed" ? "btn-confirm" : "btn-finish";
  const btn = document.getElementById(btnId);
  let originalText = "";
  if (btn) {
    originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;
  }

  const { error } = await dbUpdateBookingStatus(id, newStatus);

  if (!error) {
    closeModal("modal-booking");
    refreshAdminAll();
    showNotification(`Statut mis à jour : ${newStatus}`, "success");
  } else {
    showNotification("Erreur: " + error.message, "error");
  }

  if (btn) {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window.handleDeleteBookingFromModal = function () {
  showConfirm("Supprimer définitivement ce RDV ?", async () => {
    const id = document.getElementById("booking-id").value;
    const { error } = await dbDeleteBooking(id);
    if (!error) {
      closeModal("modal-booking");
      refreshAdminAll();
      showNotification("Rendez-vous supprimé", "success");
    } else {
      showNotification("Erreur suppression", "error");
    }
  });
};

// =============================================================================
// 6. INITIALISATION
// =============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  // Vérification de sécurité au chargement
  await checkAuth();

  const btnConf = document.getElementById("btn-confirm-action");
  if (btnConf)
    btnConf.addEventListener("click", () => {
      if (pendingAction) pendingAction();
      closeModal("modal-confirm");
      pendingAction = null;
    });

  if (document.getElementById("page-title")) {
    renderAdminStats();

    const srv = await fetchServices();
    const c = document.getElementById("admin-services-list");
    if (c)
      c.innerHTML = srv
        .map(
          (s) => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div class="font-bold text-white">${s.name} (${s.price}€)</div>
                <button onclick="dbDeleteService(${s.id})" class="text-red-400"><i class="fa-solid fa-trash"></i></button>
            </div>`
        )
        .join("");
    document.getElementById("count-services").innerText = srv.length;

    const slotForm = document.getElementById("form-edit-slot");
    if (slotForm) slotForm.addEventListener("submit", handleSaveSlot);
  }

  if (document.getElementById("booking-page")) {
    renderServiceSelector();
    const dp = document.getElementById("date-picker");
    if (dp) dp.min = new Date().toISOString().split("T")[0];
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailValue = document.getElementById("email").value;
      const passwordValue = document.getElementById("password").value;
      const btn = loginForm.querySelector("button");
      const errorMsg = document.getElementById("login-error");

      const originalText = btn.innerHTML;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';
      btn.disabled = true;
      errorMsg.classList.add("hidden");

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });

      if (error) {
        console.error("Login error:", error.message);
        errorMsg.classList.remove("hidden");
        btn.innerHTML = originalText;
        btn.disabled = false;
      } else {
        window.location.href = "admin.html";
      }
    });
  }
});

window.switchTab = function (tab) {
  document
    .querySelectorAll('[id^="view-"]')
    .forEach((el) => el.classList.add("hidden-view"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => btn.classList.remove("active"));

  const targetView = document.getElementById(`view-${tab}`);
  if (targetView) targetView.classList.remove("hidden-view");

  const targetBtn = document.getElementById(`btn-${tab}`);
  if (targetBtn) targetBtn.classList.add("active");

  if (tab === "calendar") setTimeout(() => initAdminCalendar(), 50);
  if (tab === "bookings") renderAllBookingsView();
};

window.refreshAdminAll = async function () {
  renderAdminStats();
  renderAllBookingsView();
  if (calendar) calendar.refetchEvents();
};

window.handleAddService = async function (e) {
  e.preventDefault();
  await dbAddService(
    e.target.name.value,
    e.target.price.value,
    e.target.duration.value
  );
  e.target.reset();
  window.location.reload();
};

window.dbDeleteService = dbDeleteService;
