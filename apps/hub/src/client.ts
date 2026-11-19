import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, signInAnonymously, GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithCredential, signOut as firebaseSignOut, onAuthStateChanged, getRedirectResult, linkWithRedirect } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { PlayerCommand, PlayerResponse } from '../shared/types';
const env = import.meta.env;
export const local = env.VITE_USE_FIREBASE_EMULATORS === 'true' || (import.meta.env.DEV && !env.VITE_FIREBASE_PROJECT_ID);
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-between-turns';
if (!local && (!env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_APP_ID || !env.VITE_APPCHECK_SITE_KEY)) throw new Error('Production Firebase and App Check configuration is missing.');
// Firebase Hosting serves /__/auth on this origin, avoiding cross-site storage
// restrictions during the mobile redirect fallback.
const authDomain = !local && location.hostname === `${projectId}.web.app` ? location.hostname : env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
const app = initializeApp({ projectId, apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key', authDomain, appId: env.VITE_FIREBASE_APP_ID || 'demo-app' });
const auth = getAuth(app); const functions = getFunctions(app, 'us-central1');
if (local) { connectAuthEmulator(auth, 'http://127.0.0.1:9299', { disableWarnings: true }); connectFunctionsEmulator(functions, '127.0.0.1', 5201); }
else initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
const claimKey = 'bt-sign-in-claim';
export interface Identity { signedIn: boolean; playerId?: string; displayName?: string; photoURL?: string | null; rewardsApp: { id: string; embedUrl?: string } | null; }
export function observeIdentity(callback: () => void) { return onAuthStateChanged(auth, callback); }
export async function identity(): Promise<Identity> {
  const claim = sessionStorage.getItem(claimKey);
  const result = (await invoke({ action: 'identity', ...(claim && !auth.currentUser?.isAnonymous ? { claim } : {}) })).data as unknown as Identity;
  if (result.signedIn) sessionStorage.removeItem(claimKey);
  return result;
}
export async function signIn() {
  const guest = auth.currentUser;
  if (guest?.isAnonymous) {
    const claim = (await command({ action: 'prepareSignIn' })) as { token: string };
    sessionStorage.setItem(claimKey, claim.token);
  }
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  try {
    if (guest?.isAnonymous) await linkWithPopup(guest, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/credential-already-in-use') {
      const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
      if (!credential) throw error;
      await signInWithCredential(auth, credential);
    } else if (code === 'auth/popup-blocked' && guest?.isAnonymous) {
      await linkWithRedirect(guest, provider); return;
    } else { sessionStorage.removeItem(claimKey); throw error; }
  }
  await auth.currentUser?.getIdToken(true);
}
export async function signOut() {
  await command({ action: 'signOut' });
  await firebaseSignOut(auth); sessionStorage.removeItem(claimKey);
  await signInAnonymously(auth);
}
export async function initialize() {
  await setPersistence(auth, browserLocalPersistence); await auth.authStateReady();
  try { await getRedirectResult(auth); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/credential-already-in-use') throw error;
    const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
    if (!credential) throw error;
    await signInWithCredential(auth, credential);
  }
  if (!auth.currentUser) await signInAnonymously(auth);
}
const invoke = httpsCallable<PlayerCommand, PlayerResponse>(functions, 'playerCommand');
export async function command(value: PlayerCommand) { return (await invoke(value)).data; }
