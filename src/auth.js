import { supabase } from './supabaseClient.js';

// Cadastro sem senha: manda um "magic link" pro e-mail informado — ao
// clicar, a pessoa já entra autenticada (evento SIGNED_IN/INITIAL_SESSION
// com needs_password_setup=true nos metadados) e o app mostra a mesma tela
// de "definir senha" do fluxo de recuperação (ver onAuthStateChange e
// passwordRecoveryHtml em main.js), sem nunca existir uma senha temporária
// que ninguém sabe.
export async function signUpWithEmailLink(email, fullName, companyName, captchaToken) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      data: { full_name: fullName, company_name: companyName, needs_password_setup: true },
      captchaToken,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password, captchaToken) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return data.subscription;
}

// "Esqueci minha senha": manda um e-mail com um link que abre o app já
// autenticado num evento PASSWORD_RECOVERY (ver onAuthStateChange em
// main.js), sem exigir a senha atual — diferente de changePassword acima.
export async function requestPasswordReset(email, captchaToken) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
    captchaToken,
  });
  if (error) throw error;
}

export async function confirmPasswordReset(newPassword) {
  // needs_password_setup: false limpa a flag de quem veio do cadastro sem
  // senha (ver signUpWithEmailLink) — inofensivo pra quem veio do "esqueci
  // minha senha" de verdade, que nunca teve essa flag setada.
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { needs_password_setup: false },
  });
  if (error) throw error;
}

// Exige a senha atual antes de trocar (evita que uma sessão aberta em outro
// lugar troque a senha sem o usuário confirmar quem ele é).
export async function changePassword(email, currentPassword, newPassword, captchaToken) {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
    options: { captchaToken },
  });
  if (verifyError) throw new Error('Senha atual incorreta.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
}
