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
  toast.innerHTML = `<div class="text-xl">${style.icon}</div><div class="font-bold text-sm drop-shadow-md">${message}</div>`;

  container.appendChild(toast);

  // Animation entrée
  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-10", "opacity-0")
  );

  // Auto destruction
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-[-10px]");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
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
