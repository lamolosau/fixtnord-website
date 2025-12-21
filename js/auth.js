// js/auth.js
import { supabase } from "./config.js";

export async function checkAuth() {
  // On récupère la session
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  const path = window.location.pathname;
  // Détection souple des pages
  const isAdminPage = path.includes("admin.html") || path.endsWith("/admin");
  const isLoginPage = path.includes("login.html") || path.endsWith("/login");

  // 1. Protection Admin : Pas de session -> Hop, Login
  if (isAdminPage && !session) {
    window.location.replace("login.html"); // .replace évite le retour arrière
    return;
  }

  // 2. Protection Login : Déjà connecté -> Hop, Admin
  else if (isLoginPage && session) {
    window.location.replace("admin.html");
    return;
  }

  // Si on est admin et connecté, on affiche le contenu
  if (isAdminPage && session) {
    document.body.style.setProperty("display", "flex", "important");
  }
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return true;
}

export async function logout() {
  try {
    // 1. Demande à Supabase de fermer la session
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
  } finally {
    // 2. LA SOLUTION : On vide brutalement le stockage local du navigateur
    // Cela garantit qu'il ne reste aucune trace de "session fantôme"
    localStorage.clear();

    // 3. Redirection propre
    window.location.replace("login.html");
  }
}
