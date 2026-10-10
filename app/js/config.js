// ========================================
// Jamat Frontend Config
// ========================================
// Single place to configure backend URL, feature flags, and Firebase.
// Loaded before all other js/ files via <script src="js/config.js">.

window.JAMAT_CONFIG = {
  // Shared service for both products; even previews use read-only live data.
  apiBase: 'https://takbeertime.com/api',

  // While the backend is offline / unreachable, fall back to the hardcoded
  // mosques in state.js. Flip to false once the backend is reachable.
  useMockData: false,

  // Never allow local impersonation against the shared production service.
  devAuthEnabled: false,

  // Default search radius in meters for "mosques near me".
  defaultRadiusMeters: 5000,

  // Firebase web SDK config — fill in from your Firebase Console.
  // Auth stays disabled until apiKey + projectId are populated.
  firebase: {
    apiKey: 'AIzaSyAJxvymGOB0c_AqXy7stOM1LzS53thUR_Y',
    authDomain: 'takbeerapp.firebaseapp.com',
    projectId: 'takbeerapp',
    storageBucket: 'takbeerapp.firebasestorage.app',
    messagingSenderId: '797230147137',
    appId: '',
  },
};
