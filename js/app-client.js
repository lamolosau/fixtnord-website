// js/app-client.js
import { supabase } from "./config.js";
import { showNotification } from "./utils.js";

// --- ETAT GLOBAL ---
let currentService = null;
window.selectedSlotIso = null;

// --- 1. LOGIQUE UI AVIS (Etoiles interactives) ---
function initStarRating() {
  const container = document.getElementById("star-container");
  const input = document.getElementById("rating-value");
  if (!container || !input) return;

  const stars = container.querySelectorAll("i");

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      const val = star.getAttribute("data-value");
      input.value = val;
      updateStars(val);
    });
  });

  function updateStars(value) {
    stars.forEach((s) => {
      const v = s.getAttribute("data-value");
      if (v <= value) {
        s.classList.remove("fa-regular");
        s.classList.add("fa-solid", "text-orange-400");
      } else {
        s.classList.remove("fa-solid", "text-orange-400");
        s.classList.add("fa-regular");
      }
    });
  }
}

// --- 2. LOGIQUE AFFICHAGE AVIS (Accueil) ---
function generateStarsHtml(rating) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let html = "";
  for (let i = 0; i < fullStars; i++)
    html += '<i class="fa-solid fa-star"></i>';
  if (hasHalf) html += '<i class="fa-solid fa-star-half-stroke"></i>';
  return html;
}

async function updateGlobalRating() {
  const headerEl = document.getElementById("global-rating");
  const sectionEl = document.getElementById("section-rating-display");
  if (!headerEl && !sectionEl) return;

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("approved", true);

  if (!reviews || reviews.length === 0) {
    if (headerEl)
      headerEl.innerHTML = '<i class="fa-regular fa-star"></i> --/5 (0 avis)';
    if (sectionEl)
      sectionEl.innerHTML =
        '<span class="text-slate-400">Pas encore d\'avis.</span>';
    return;
  }

  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  const average = (total / reviews.length).toFixed(1);

  if (headerEl)
    headerEl.innerHTML = `<i class="fa-solid fa-star"></i> ${average}/5 <span class="text-xs text-slate-400 ml-1">(${reviews.length})</span>`;

  if (sectionEl) {
    sectionEl.innerHTML = `
        <div class="flex flex-col items-center gap-1">
            <div class="text-2xl text-orange-400 flex gap-1 drop-shadow-sm">${generateStarsHtml(
              average
            )}</div>
            <div class="text-slate-500 font-medium text-sm">Note : <span class="text-[#002050] font-bold">${average}/5</span> (${
      reviews.length
    } avis)</div>
        </div>`;
  }
}

export async function loadReviewsCarousel() {
  const wrapper = document.getElementById("scrolling-wrapper-dynamic");
  if (!wrapper) return;
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!reviews || reviews.length === 0) return;

  wrapper.innerHTML = reviews
    .map(
      (r) => `
    <div class="w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-shrink-0 mx-2 snap-center">
        <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#5475FF] font-bold uppercase">${r.customer_name.charAt(
              0
            )}</div>
            <div><div class="font-bold text-[#002050]">${
              r.customer_name
            }</div><div class="text-xs text-slate-400">${
        r.car_model || "Client"
      }</div></div>
            <div class="ml-auto text-orange-400 text-xs"><i class="fa-solid fa-star"></i> ${
              r.rating
            }/5</div>
        </div>
        <p class="text-slate-500 text-sm line-clamp-4">"${r.comment}"</p>
    </div>`
    )
    .join("");
}

// --- 3. ENVOI D'AVIS (Page Avis) ---
export async function handlePostReview(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-review");
  const originalText = btn.innerHTML;

  // Récupération des valeurs
  const ratingValue = document.getElementById("rating-value").value;
  const fullName = document.getElementById("review-name").value.trim(); // Trim enlève les espaces inutiles avant/après
  const car = document.getElementById("review-car").value.trim();
  const comment = document.getElementById("review-comment").value.trim();

  // Validation basique
  if (!ratingValue) {
    showNotification("Veuillez sélectionner une note.", "error");
    return;
  }
  if (!fullName) {
    showNotification("Le nom est obligatoire.", "error");
    return;
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Vérification...';
  btn.disabled = true;

  try {
    // 1. Vérification sécurisée (RPC)
    const { data: canPost, error: rpcError } = await supabase.rpc(
      "check_can_review",
      { client_name: fullName }
    );
    if (rpcError) throw rpcError;

    if (!canPost) {
      // --- C'EST ICI QUE ÇA CHANGE ---
      // Au lieu de alert(), on affiche la modale personnalisée
      document.getElementById("error-modal").classList.remove("hidden");

      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    // 2. Insertion si tout est OK
    const { error } = await supabase.from("reviews").insert([
      {
        customer_name: fullName,
        car_model: car,
        rating: parseInt(ratingValue),
        comment: comment,
        approved: false,
      },
    ]);

    if (error) throw error;

    // 3. Succès
    document.getElementById("review-form").classList.add("hidden");
    document.getElementById("review-success").classList.remove("hidden");
    showNotification("Avis envoyé avec succès !", "success");
  } catch (err) {
    console.error(err);
    showNotification("Erreur technique : " + err.message, "error");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// --- 4. RÉSERVATION (Standard) ---
export async function initBookingPage() {
  const container = document.getElementById("service-selector-container");
  if (!container) return;

  const dp = document.getElementById("date-picker");
  if (dp) dp.min = new Date().toISOString().split("T")[0];

  container.innerHTML =
    '<div class="text-center py-4 text-blue-300"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("price");

  if (!services || services.length === 0) {
    container.innerHTML =
      "<p class='text-center text-red-400 bg-red-50 p-2 rounded'>Aucun service disponible.</p>";
    return;
  }

  container.innerHTML = services
    .map(
      (s) => `
        <div data-id="${s.id}" class="service-card border border-white/20 bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-white/10 transition mb-2 flex justify-between items-center group">
             <div><div class="font-bold text-white text-lg">${s.name}</div><div class="text-xs text-blue-300 font-medium">${s.duration} min</div></div>
             <div class="font-bold text-[#5475FF] bg-blue-50 px-3 py-1 rounded-lg shadow-sm">${s.price}€</div>
        </div>`
    )
    .join("");

  container.querySelectorAll(".service-card").forEach((card) => {
    card.addEventListener("click", () => {
      const s = services.find((srv) => srv.id == card.dataset.id);
      selectService(s, card);
    });
  });
}

function selectService(service, element) {
  document
    .querySelectorAll(".service-card")
    .forEach((el) =>
      el.classList.remove("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg")
    );
  element.classList.add("ring-2", "ring-[#5475FF]", "bg-white", "shadow-lg");
  currentService = service;
  document.getElementById("summary-service").innerText = service.name;
  document.getElementById("total-price-display").innerText =
    service.price + "€";
  document.getElementById("final-service-id").value = service.id;
  document.getElementById("final-price").value = service.price;
  document
    .getElementById("date-step")
    .classList.remove("opacity-50", "pointer-events-none");
  const datePicker = document.getElementById("date-picker");
  if (datePicker.value) handleDateChange(datePicker.value);
}

window.onDateChanged = () => {
  const val = document.getElementById("date-picker").value;
  handleDateChange(val);
};

async function handleDateChange(dateInput) {
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
      '<div class="col-span-3 text-center text-slate-400 py-2">Aucune disponibilité ce jour.</div>';
    return;
  }
  let availableTimes = [];
  const step = 30;
  const duration = parseInt(currentService.duration) || 60;
  rawSlots.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  rawSlots.forEach((slot) => {
    let cursor = new Date(slot.start_time);
    let limit = new Date(slot.end_time);
    while (cursor.getTime() + duration * 60000 <= limit.getTime()) {
      const startAttempt = new Date(cursor);
      const endAttempt = new Date(cursor.getTime() + duration * 60000);
      const isBusy = busyBookings.some((b) => {
        const bS = new Date(b.start_time);
        const bE = new Date(b.end_time);
        return startAttempt < bE && endAttempt > bS;
      });
      if (!isBusy) {
        const label = cursor.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        if (!availableTimes.some((t) => t.label === label))
          availableTimes.push({ label, iso: startAttempt.toISOString() });
      }
      cursor.setMinutes(cursor.getMinutes() + step);
    }
  });

  if (availableTimes.length === 0)
    container.innerHTML =
      '<div class="col-span-3 text-center text-orange-400 py-2">Complet ce jour.</div>';
  else {
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
}

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

export async function handlePayment(e) {
  e.preventDefault();
  const btn = document.getElementById("pay-btn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
  btn.disabled = true;

  if (!window.selectedSlotIso || !currentService) {
    alert("Erreur: Veuillez sélectionner un créneau.");
    btn.innerHTML = originalText;
    btn.disabled = false;
    return;
  }
  const start = new Date(window.selectedSlotIso);
  const end = new Date(start.getTime() + currentService.duration * 60000);
  const make = document.getElementById("car-make").value;
  const model = document.getElementById("car-model").value;
  const year = document.getElementById("car-year").value;
  const fullCarModel = `${make} ${model} (${year})`;

  const bookingData = {
    customer_name: (
      document.getElementById("prenom").value +
      " " +
      document.getElementById("nom").value
    ).trim(),
    email: document.getElementById("email").value,
    phone: document.getElementById("tel").value,
    car_model: fullCarModel,
    address: document.getElementById("address").value,
    service_name: currentService.name,
    price: currentService.price,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: "pending",
  };

  const { error } = await supabase.from("bookings").insert([bookingData]);

  if (!error) {
    showNotification("Rendez-vous envoyé !", "success");
    setTimeout(() => (window.location.href = "index.html"), 2000);
  } else {
    alert("Erreur: " + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  loadReviewsCarousel();
  updateGlobalRating();

  // Page Booking
  if (document.getElementById("booking-page")) {
    initBookingPage();
    const bookingForm = document.getElementById("booking-form");
    if (bookingForm) bookingForm.addEventListener("submit", handlePayment);
  }

  // Page Avis
  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    initStarRating(); // <-- Active les étoiles cliquables
    reviewForm.addEventListener("submit", handlePostReview);
  }
});
