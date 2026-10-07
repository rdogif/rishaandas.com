import { getClient } from './client.js';
const status = document.querySelector('#connect-status');
const send = document.querySelector('#send');
try {
  const client = await getClient();
  send.disabled = false;
  status.textContent = 'Sign in with the existing admin email. This browser can remember your session.';
  document.querySelector('#connect-form').addEventListener('submit', async event => {
    event.preventDefault();
    send.disabled = true;
    status.textContent = 'Sending…';
    try {
      const { error } = await client.auth.signInWithOtp({
        email: document.querySelector('#email').value.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: new URL('./', location.href).href },
      });
      if (error) throw error;
      status.textContent = 'If this is your approved account, a link is on its way. Open the email link in this same browser. Check spam too.';
    } catch {
      status.textContent = 'Could not send a link. Check your connection, email address, and Supabase email setup. Wait a minute before trying again.';
    } finally { send.disabled = false; }
  });
} catch (error) { status.textContent = error.message; }
