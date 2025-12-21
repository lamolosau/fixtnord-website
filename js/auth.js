// js/auth.js
import { supabase } from "./config.js";

export async function checkAuth() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  const path = window.location.pathname;
  const isAdminPage = path.includes("admin.html");
  const isLoginPage = path.includes("login.html");

  if (isAdminPage && !session) {
    window.location.href = "login.html";
  } else if (isLoginPage && session) {
    window.location.href = "admin.html";
  }

  // Si on est admin, on affiche le body (évite le flash de contenu protégé)
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
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
