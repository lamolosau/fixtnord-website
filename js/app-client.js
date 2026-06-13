import { supabase } from "./config.js";
import {
  showNotification,
  validateEmail,
  validatePhone,
  sanitizeInput,
  initMobileMenu,
} from "./utils.js";

// --- 1. AVIS & CAROUSEL ---
async function updateGlobalRating() {
  const headerEl = document.getElementById("global-rating");
  if (!headerEl) return;
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("approved", true);
  if (!reviews || reviews.length === 0) return;
  const average = (
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
  ).toFixed(1);
  headerEl.innerHTML = `<i class="fa-solid fa-star"></i> ${average}/5 (${reviews.length})`;
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
  if (!reviews) return;

  // Si pas d'avis, afficher un message
  if (reviews.length === 0) {
    wrapper.innerHTML = `
      <div class="w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-shrink-0 mx-2">
        <p class="text-slate-400 text-center">Soyez le premier à laisser un avis !</p>
      </div>
    `;
    return;
  }

  wrapper.innerHTML = reviews
    .map(
      (r) => `
    <div class="w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-shrink-0 mx-2 snap-center">
        <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#5475FF] font-bold uppercase">${sanitizeInput(r.customer_name.charAt(0))}</div>
            <div><div class="font-bold text-[#002050]">${sanitizeInput(r.customer_name)}</div><div class="text-xs text-slate-400">${sanitizeInput(r.car_model || "Client")}</div></div>
            <div class="ml-auto text-orange-400 text-xs"><i class="fa-solid fa-star"></i> ${r.rating}/5</div>
        </div>
        <p class="text-slate-500 text-sm line-clamp-4">"${sanitizeInput(r.comment)}"</p>
    </div>`,
    )
    .join("");

  // Dupliquer pour l'effet de défilement infini
  wrapper.innerHTML += wrapper.innerHTML;
}

// --- 2. RECHERCHE PAR PLAQUE (SIMULATION API) ---
window.handlePlateLookup = function () {
  const plateInput = document.getElementById("plate-lookup-input");
  const btn = document.getElementById("btn-plate-lookup");
  const plate = plateInput.value.trim();

  if (!plate) {
    showNotification("Veuillez entrer une plaque d'immatriculation", "error");
    return;
  }

  // Formatage basique pour l'affichage
  const formattedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Simulation de chargement
  const originalIcon = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  btn.disabled = true;

  setTimeout(() => {
    // Remettre le bouton à l'état initial
    btn.innerHTML = originalIcon;
    btn.disabled = false;

    // Afficher le message d'indisponibilité
    showNotification(
      "Le service de recherche automatique est temporairement en maintenance. Veuillez saisir les informations manuellement.",
      "info",
    );

    // Pré-remplir le champ plaque manuel pour faire gagner du temps
    const manualPlateInput = document.getElementById("input-plate");
    if (manualPlateInput) {
      manualPlateInput.value = plate;
      // Petit effet visuel pour montrer que ça a été copié
      manualPlateInput.classList.add("ring-2", "ring-[#5475FF]");
      setTimeout(
        () => manualPlateInput.classList.remove("ring-2", "ring-[#5475FF]"),
        1000,
      );
    }

    /* 
    // --- CODE PRÊT POUR L'API FUTURE ---
    // À décommenter quand vous aurez une API (ex: SIV, API Plaque, etc.)
    
    try {
      const response = await fetch(`URL_DE_VOTRE_API?plate=${formattedPlate}&apikey=VOTRE_CLE`);
      const data = await response.json();
      
      if (data && data.success) {
        // Remplir les champs
        document.getElementById("input-brand").value = data.vehicle.brand;
        document.getElementById("input-model").value = data.vehicle.model;
        document.getElementById("input-year").value = data.vehicle.year;
        document.getElementById("input-plate").value = formattedPlate;
        
        showNotification("Véhicule trouvé !", "success");
      } else {
        showNotification("Véhicule introuvable. Veuillez saisir manuellement.", "error");
      }
    } catch (error) {
      showNotification("Erreur de connexion au service.", "error");
    }
    */
  }, 1500); // Simule 1.5s de temps de réponse réseau
};

// --- 3. SOUMISSION DEMANDE DE DEVIS ---
window.handleDevisSubmit = async function (e) {
  e.preventDefault();

  const btn = document.getElementById("submit-btn");
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours...';
  btn.disabled = true;

  try {
    // Récupération et validation des données
    const prenom = sanitizeInput(
      document.getElementById("prenom").value.trim(),
    );
    const nom = sanitizeInput(document.getElementById("nom").value.trim());
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("tel").value.trim();
    const address = sanitizeInput(
      document.getElementById("address").value.trim(),
    );
    const plate = sanitizeInput(
      document.getElementById("plate")?.value.trim() || "",
    );
    const message = sanitizeInput(
      document.getElementById("message")?.value.trim() || "",
    );

    // Validation
    if (!validateEmail(email)) {
      showNotification("Email invalide", "error");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    if (!validatePhone(phone)) {
      showNotification(
        "Numéro de téléphone invalide (format français requis)",
        "error",
      );
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    // Récupération des services sélectionnés
    const serviceCheckboxes = document.querySelectorAll(
      'input[name="service"]:checked',
    );
    const services = Array.from(serviceCheckboxes).map((cb) => cb.value);

    if (services.length === 0) {
      showNotification("Veuillez sélectionner au moins un service", "error");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    // Récupération des infos véhicule
    const carBrand = sanitizeInput(
      document.getElementById("input-brand")?.value.trim() || "Non spécifié",
    );
    const carModel = sanitizeInput(
      document.getElementById("input-model")?.value.trim() || "Non spécifié",
    );
    const carYear =
      parseInt(document.getElementById("input-year")?.value) || null;
    const carPlate = sanitizeInput(
      document.getElementById("input-plate")?.value.trim() || "",
    );

    // Préparation des données
    const data = {
      customer_name: `${prenom} ${nom}`,
      email: email,
      phone: phone,
      address: address,
      car_brand: carBrand,
      car_model: carModel,
      car_year: carYear,
      car_plate: carPlate || plate || null,
      services: services,
      message: message || null,
      status: "pending",
    };

    // Insertion dans Supabase
    const { error } = await supabase.from("quote_requests").insert([data]);

    if (error) {
      console.error("Erreur Supabase:", error);
      showNotification("Erreur lors de l'envoi. Veuillez réessayer.", "error");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    // Succès - Afficher page de confirmation
    document.getElementById("devis-page").innerHTML = `
      <div class="bg-white p-12 rounded-[2.5rem] shadow-2xl text-center max-w-2xl mx-auto w-full my-12">
        <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
          <i class="fa-solid fa-check"></i>
        </div>
        <h2 class="text-3xl font-extrabold text-[#002050] mb-4">Demande envoyée !</h2>
        <p class="text-slate-500 mb-8">
          Votre demande de devis a bien été enregistrée. Nous vous recontacterons dans les 24h par email ou téléphone.
        </p>
        <div class="bg-blue-50 p-6 rounded-2xl mb-8 text-left border border-blue-100">
          <p class="font-bold text-[#002050] mb-2">
            <i class="fa-solid fa-circle-info text-[#5475FF] mr-2"></i>Récapitulatif
          </p>
          <p class="text-slate-600 text-sm"><strong>Véhicule :</strong> ${carBrand} ${carModel} ${carYear ? `(${carYear})` : ""}</p>
          <p class="text-slate-600 text-sm"><strong>Services :</strong> ${services.join(", ")}</p>
          <p class="text-slate-600 text-sm"><strong>Email :</strong> ${email}</p>
        </div>
        <div class="flex gap-4 justify-center">
          <a href="index.html" class="bg-[#002050] hover:bg-[#5475FF] text-white px-8 py-4 rounded-xl font-bold transition-all">
            Retour à l'accueil
          </a>
          <a href="devis.html" class="bg-slate-100 text-[#002050] px-8 py-4 rounded-xl font-bold hover:bg-slate-200 transition-all">
            Nouvelle demande
          </a>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Erreur:", err);
    showNotification("Une erreur est survenue. Veuillez réessayer.", "error");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// --- 4. INITIALISATION GLOBALE ---
document.addEventListener("DOMContentLoaded", () => {
  // Initialisation du menu mobile
  initMobileMenu();

  // Chargement des avis et note globale
  loadReviewsCarousel();
  updateGlobalRating();

  // Gestion des étoiles (page avis.html)
  const starContainer = document.getElementById("star-container");
  if (starContainer) {
    const stars = starContainer.querySelectorAll("i");
    const ratingInput = document.getElementById("rating-value");

    stars.forEach((star, index) => {
      star.addEventListener("click", () => {
        const value = index + 1;
        ratingInput.value = value;

        stars.forEach((s, i) => {
          if (i < value) {
            s.classList.remove("fa-regular");
            s.classList.add("fa-solid", "text-orange-400");
          } else {
            s.classList.remove("fa-solid", "text-orange-400");
            s.classList.add("fa-regular");
          }
        });
      });

      star.addEventListener("mouseenter", () => {
        stars.forEach((s, i) => {
          if (i <= index) {
            s.classList.add("text-orange-400");
          } else {
            s.classList.remove("text-orange-400");
          }
        });
      });
    });

    starContainer.addEventListener("mouseleave", () => {
      const currentValue = parseInt(ratingInput.value) || 0;
      stars.forEach((s, i) => {
        if (i < currentValue) {
          s.classList.add("text-orange-400");
        } else {
          s.classList.remove("text-orange-400");
        }
      });
    });
  }

  // Soumission d'avis
  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const rating = parseInt(document.getElementById("rating-value").value);
      const name = sanitizeInput(
        document.getElementById("review-name").value.trim(),
      );
      const car = sanitizeInput(
        document.getElementById("review-car").value.trim(),
      );
      const comment = sanitizeInput(
        document.getElementById("review-comment").value.trim(),
      );

      if (!rating || rating < 1 || rating > 5) {
        showNotification("Veuillez sélectionner une note", "error");
        return;
      }

      const btn = document.getElementById("btn-submit-review");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi...';

      const data = {
        customer_name: name,
        car_model: car,
        rating: rating,
        comment: comment,
        approved: false,
      };

      const { error } = await supabase.from("reviews").insert([data]);

      if (error) {
        showNotification("Erreur lors de l'envoi", "error");
        btn.disabled = false;
        btn.innerHTML = "Publier mon avis";
        return;
      }

      document.getElementById("review-form").classList.add("hidden");
      document.getElementById("review-success").classList.remove("hidden");
    });
  }
});
