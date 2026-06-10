'use client';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export const CLOUD_API_BASE_URL = (process.env.NEXT_PUBLIC_FIREBASE_API_BASE_URL || 'https://us-central1-autonateai-learning-hub.cloudfunctions.net/intelApi').replace(/\/$/, '');

let authReadyPromise: Promise<void> | null = null;

function waitForAuthReady() {
  if (auth.currentUser) return Promise.resolve();
  authReadyPromise ||= new Promise((resolve) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve();
    }, 2500);
    unsubscribe = onAuthStateChanged(auth, () => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
  return authReadyPromise;
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${CLOUD_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  await waitForAuthReady();

  if (auth.currentUser) {
    headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
  });
}
