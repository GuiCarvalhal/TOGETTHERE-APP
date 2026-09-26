import { getAccessToken } from '@base44/sdk';

const isNode = typeof window === 'undefined';

const isClearAccessTokenRequested = () =>
	!isNode && new URLSearchParams(window.location.search).get("clear_access_token") === 'true';

const clearStoredAccessToken = () => {
	window.localStorage.removeItem('base44_access_token');
	window.localStorage.removeItem('token');
}

const getAppParams = () => {
	if (isClearAccessTokenRequested()) {
		clearStoredAccessToken();
	}
	// The SDK's getAccessToken() only reads the access_token from the query
	// string (window.location.search). Some OAuth callbacks return the token
	// in the URL fragment (#access_token=...), which would be missed and the
	// user bounced back to /login. Normalize a fragment token into the query
	// before the SDK reads it, so consumption works on every domain.
	if (!isNode && window.location && window.location.hash) {
		try {
			const hashParams = new URLSearchParams(window.location.hash.slice(1));
			const fragToken = hashParams.get('access_token');
			if (fragToken) {
				const sp = new URLSearchParams(window.location.search);
				if (!sp.get('access_token')) sp.set('access_token', fragToken);
				const qs = sp.toString();
				window.history.replaceState({}, document.title, `${window.location.pathname}${qs ? `?${qs}` : ''}`);
			}
		} catch (e) {
			console.error('Error normalizing access_token from hash:', e);
		}
	}
	return {
		appId: import.meta.env.VITE_BASE44_APP_ID,
		token: getAccessToken(),
		functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
		appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
	}
}


export const appParams = {
	...getAppParams()
}