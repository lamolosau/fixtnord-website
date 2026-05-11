import { supabase } from "./config.js";
import { showNotification } from "./utils.js";

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
  wrapper.innerHTML = reviews
    .map(
      (r) => `
    <div class="w-[300px] bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-shrink-0 mx-2 snap-center">
        <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#5475FF] font-bold uppercase">${r.customer_name.charAt(0)}</div>
            <div><div class="font-bold text-[#002050]">${r.customer_name}</div><div class="text-xs text-slate-400">${r.car_model || "Client"}</div></div>
            <div class="ml-auto text-orange-400 text-xs"><i class="fa-solid fa-star"></i> ${r.rating}/5</div>
        </div>
        <p class="text-slate-500 text-sm line-clamp-4">"${r.comment}"</p>
    </div>`,
    )
    .join("");
}

// --- 2. CATALOGUE & LOGIQUE DE SÉLECTION ---
let selectedPiece = null;
let currentMatchingRows = []; // Stocke toutes les lignes correspondant au modèle choisi

window.handlePlateLookup = function () {
  showNotification(
    "Recherche par plaque bientôt disponible. Remplissage manuel.",
    "info",
  );
};

export async function initCatalog() {
  const brandSel = document.getElementById("select-brand");
  if (!brandSel) return;

  const { data: catalog, error } = await supabase
    .from("vehicles_catalog")
    .select("*")
    .order("brand");

  if (error || !catalog) {
    brandSel.innerHTML =
      '<option disabled class="text-slate-800 bg-white">Erreur de catalogue</option>';
    return;
  }

  // Remplir les Marques
  const brands = [...new Set(catalog.map((i) => i.brand))];
  brandSel.innerHTML =
    '<option value="" disabled selected class="text-slate-800 bg-white">Choisir une marque...</option>' +
    brands
      .map(
        (b) =>
          `<option value="${b}" class="text-slate-800 bg-white">${b}</option>`,
      )
      .join("");

  // Événement : Changement de Marque
  brandSel.addEventListener("change", (e) => {
    const models = [
      ...new Set(
        catalog.filter((i) => i.brand === e.target.value).map((i) => i.model),
      ),
    ];
    const modelSel = document.getElementById("select-model");
    modelSel.innerHTML =
      '<option value="" disabled selected class="text-slate-800 bg-white">Choisir un modèle...</option>' +
      models
        .map(
          (m) =>
            `<option value="${m}" class="text-slate-800 bg-white">${m}</option>`,
        )
        .join("");
    modelSel.disabled = false;
    document.getElementById("select-year").disabled = true;
    document.getElementById("catalog-result").classList.add("hidden");
  });

  // Événement : Changement de Modèle (Correction ici pour gérer plusieurs lignes)
  document.getElementById("select-model").addEventListener("change", (e) => {
    const selectedBrand = brandSel.value;
    const selectedModel = e.target.value;
    const yearSel = document.getElementById("select-year");

    // On récupère TOUTES les lignes qui correspondent à ce modèle (Phase 1, Phase 2, etc.)
    currentMatchingRows = catalog.filter(
      (i) => i.brand === selectedBrand && i.model === selectedModel,
    );

    let allYears = new Set();
    // On boucle sur chaque ligne trouvée pour extraire toutes les années possibles
    currentMatchingRows.forEach((row) => {
      for (let y = row.year_start; y <= row.year_end; y++) {
        allYears.add(y);
      }
    });

    // On trie les années par ordre croissant
    const sortedYears = Array.from(allYears).sort((a, b) => a - b);

    let opts =
      '<option value="" disabled selected class="text-slate-800 bg-white">Année...</option>';
    sortedYears.forEach((y) => {
      opts += `<option value="${y}" class="text-slate-800 bg-white">${y}</option>`;
    });

    yearSel.innerHTML = opts;
    yearSel.disabled = false;
    document.getElementById("catalog-result").classList.add("hidden");
    document.getElementById("pay-btn").disabled = true;
  });

  // Événement : Changement d'Année
  document.getElementById("select-year").addEventListener("change", (e) => {
    const yearChosen = parseInt(e.target.value);

    // On cherche dans nos lignes celle qui couvre l'année sélectionnée
    selectedPiece = currentMatchingRows.find(
      (row) => yearChosen >= row.year_start && yearChosen <= row.year_end,
    );

    if (selectedPiece) {
      document.getElementById("result-part-name").innerText =
        selectedPiece.part_name;
      document.getElementById("result-price").innerText =
        selectedPiece.price + "€";
      document.getElementById("catalog-result").classList.remove("hidden");

      // Remplissage des champs cachés pour la commande
      document.getElementById("final-part-name").value =
        selectedPiece.part_name;
      document.getElementById("final-price").value = selectedPiece.price;
      document.getElementById("final-vehicle").value =
        `${selectedPiece.brand} ${selectedPiece.model} (${yearChosen})`;

      document.getElementById("pay-btn").disabled = false;
    }
  });
}

// --- 3. PAIEMENT & ENREGISTREMENT ---
export async function handlePayment(e) {
  e.preventDefault();
  const btn = document.getElementById("pay-btn");
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
  btn.disabled = true;

  const data = {
    customer_name:
      document.getElementById("prenom").value +
      " " +
      document.getElementById("nom").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("tel").value,
    car_model: document.getElementById("final-vehicle").value,
    address: document.getElementById("address").value,
    service_name: document.getElementById("final-part-name").value,
    price: document.getElementById("final-price").value,
    status: "pending",
  };

  const { error } = await supabase.from("bookings").insert([data]);

  if (!error) {
    document.getElementById("booking-page").innerHTML = `
            <div class="bg-white p-12 rounded-[2.5rem] shadow-2xl text-center max-w-2xl mx-auto w-full my-12">
                <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6"><i class="fa-solid fa-check"></i></div>
                <h2 class="text-3xl font-extrabold text-[#002050] mb-4">Commande confirmée !</h2>
                <p class="text-slate-500 mb-8">Votre commande de pièce a été enregistrée.</p>
                <div class="bg-blue-50 p-6 rounded-2xl mb-8 text-left border border-blue-100">
                    <p class="font-bold text-[#002050]">Étape suivante :</p>
                    <p class="text-slate-600 mt-2">Appelez-nous au <a href="tel:0783728977" class="text-[#5475FF] font-bold underline">07 83 72 89 77</a> pour fixer le RDV d'installation.</p>
                </div>
                <a href="index.html" class="bg-slate-100 text-[#002050] px-8 py-4 rounded-xl font-bold">Retour</a>
            </div>`;
  } else {
    showNotification("Erreur lors de la commande.", "error");
    btn.innerHTML = "Payer ma pièce";
    btn.disabled = false;
  }
}

// --- 4. DEMANDE SUR MESURE ---
window.handleCustomRequest = async function (e) {
  e.preventDefault();
  const data = {
    customer_name: document.getElementById("custom-name").value,
    phone: document.getElementById("custom-phone").value,
    car_model: `${document.getElementById("custom-brand").value} ${document.getElementById("custom-model").value} (${document.getElementById("custom-year").value})`,
    service_name: "DEMANDE SUR MESURE (Devis)",
    price: 0,
    status: "pending",
  };
  const { error } = await supabase.from("bookings").insert([data]);
  if (!error) {
    document.getElementById("custom-request-modal").classList.add("hidden");
    showNotification("Demande envoyée !", "success");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  loadReviewsCarousel();
  updateGlobalRating();
  if (document.getElementById("booking-page")) initCatalog();
});
