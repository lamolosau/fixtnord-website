// js/auth.js
import { supabase } from "./config.js";

export async function checkAuth() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  const path = window.location.pathname;

  // CORRECTION ICI : On cherche juste "admin" ou "login" (plus souple)
  const isAdminPage = path.includes("admin");
  const isLoginPage = path.includes("login");

  // 1. Redirection de sécurité
  if (isAdminPage && !session) {
    // Si on est sur admin sans session -> Login
    // replace() est mieux que href car on ne peut pas faire "Retour"
    window.location.replace("login.html");
    return;
  } else if (isLoginPage && session) {
    // Si on est sur login avec session -> Admin
    window.location.replace("admin.html");
    return;
  }

  // 2. Affichage du contenu (La correction anti-page blanche)
  if (isAdminPage) {
    if (session) {
      document.body.style.visibility = "visible";
      document.body.style.opacity = "1";
    } else {
      // Si pas de session (et que la redirection traîne), on laisse caché
      // ou on affiche rien. Le replace() plus haut s'en charge.
    }
  }
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return true;
}

export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error(err);
  } finally {
    // Nettoyage brutal pour éviter les boucles de redirection
    localStorage.clear();
    window.location.replace("login.html");
  }
}
