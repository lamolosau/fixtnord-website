// js/utils.js

// Système de notification (Toast)
export function showNotification(message, type = "success") {
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
  toast.innerHTML = `<div class="text-xl">${style.icon}</div><div class="font-bold text-sm drop-shadow-md">${sanitizeInput(message)}</div>`;

  container.appendChild(toast);

  // Animation entrée
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0"),
  );

  // Auto destruction
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Validation d'email
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validation de numéro de téléphone français
export function validatePhone(phone) {
  // Accepte: 06/07 XX XX XX XX ou +33 6/7 XX XX XX XX ou 00336/7XXXXXXXX
  const phoneRegex = /^(?:(?:\+|00)33|0)[1-9](?:[0-9]{8})$/;
  // Nettoie les espaces avant validation
  const cleanPhone = phone.replace(/\s/g, "");
  return phoneRegex.test(cleanPhone);
}

// Sanitisation des entrées utilisateur (protection XSS basique)
export function sanitizeInput(input) {
  if (typeof input !== "string") return input;

  // Remplace les caractères dangereux
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

// Formater un numéro de téléphone français
export function formatPhoneNumber(phone) {
  // Nettoie le numéro
  const cleaned = phone.replace(/\D/g, "");

  // Formate en XX XX XX XX XX
  if (cleaned.length === 10) {
    return cleaned.replace(
      /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      "$1 $2 $3 $4 $5",
    );
  }

  return phone;
}

// Gestion du Menu Mobile (Burger)
export function initMobileMenu() {
  const burgerBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");
  const closeBtn = document.getElementById("mobile-menu-close");
  const menuLinks = document.querySelectorAll(".mobile-link");

  if (burgerBtn && mobileMenu) {
    // Ouvrir le menu
    burgerBtn.addEventListener("click", () => {
      mobileMenu.classList.remove("translate-x-full");
      document.body.style.overflow = "hidden"; // Empêche le scroll
    });

    // Fermer le menu (bouton X)
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        mobileMenu.classList.add("translate-x-full");
        document.body.style.overflow = "";
      });
    }

    // Fermer le menu au clic sur un lien
    menuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        mobileMenu.classList.add("translate-x-full");
        document.body.style.overflow = "";
      });
    });
  }
}

// Gestion des Modales (simples helpers)
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
}

// Debounce pour les événements répétitifs
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
