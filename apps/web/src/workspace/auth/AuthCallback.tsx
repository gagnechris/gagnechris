import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SITE_AUTHOR_NAME } from '@gagnechris/shared';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { ensureAmplifyConfigured } from './config';
import { takeReturnTo } from './session';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    const succeed = () => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      navigate(takeReturnTo(), { replace: true });
    };

    const fail = (message: string) => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      setError(message);
    };

    ensureAmplifyConfigured();

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
        case 'signedIn':
          succeed();
          break;
        case 'signInWithRedirect_failure':
          fail(
            payload.data?.error?.message ??
              'Sign-in with Cognito failed. Try again.',
          );
          break;
        default:
          break;
      }
    });

    // Listener may finish before Hub.subscribe; also covers already-signed-in.
    void (async () => {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) {
          succeed();
          return;
        }
        // OAuth exchange is async via enableOAuthListener; give it a moment.
        await new Promise((r) => setTimeout(r, 2500));
        const retry = await fetchAuthSession();
        if (retry.tokens?.idToken) {
          succeed();
        } else if (!settled) {
          fail('Sign-in did not return tokens. Try again.');
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Sign-in failed');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="admin-shell admin-shell--centered">
      <title>{`Signing in - ${SITE_AUTHOR_NAME}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      {error ? (
        <>
          <h1>Sign-in failed</h1>
          <p>{error}</p>
          <a href="/">Try again</a>
        </>
      ) : (
        <p>Completing sign-in…</p>
      )}
    </div>
  );
}
