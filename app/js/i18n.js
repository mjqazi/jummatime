// ═══════════════════════════════════════════════════════════════════
// Lightweight i18n for JummaTime.
//
//   - English is inlined as the canonical fallback (always available)
//   - Other languages are fetched from /i18n/<lang>.json on demand
//   - Auto-detects from localStorage > navigator.language > English
//   - DOM substitution via [data-i18n], [data-i18n-placeholder],
//     [data-i18n-aria-label], [data-i18n-title]
//   - Set lang+dir on <html> so CSS can target [dir="rtl"]
//   - Code can call i18n.t(key, params) for runtime strings (toasts etc.)
// ═══════════════════════════════════════════════════════════════════

window.i18n = (() => {
  // Whitelist: must match a JSON file shipped under /i18n/.
  // Order = language picker order in the header.
  // Ordered roughly by Muslim-speaker population. Picker shows in this order.
  const SUPPORTED = ['en', 'ar', 'ur', 'id', 'bn', 'hi', 'tr', 'fa', 'ms', 'fr'];
  const RTL = new Set(['ar', 'ur', 'fa']);
  const STORAGE_KEY = 'jamat.lang';

  // Display labels shown in the picker (always in the target language so
  // a user who doesn't read English can still find their language).
  const LABELS = {
    en: 'English',
    ar: 'العربية',
    ur: 'اردو',
    id: 'Bahasa Indonesia',
    bn: 'বাংলা',
    hi: 'हिन्दी',
    tr: 'Türkçe',
    fa: 'فارسی',
    ms: 'Bahasa Melayu',
    fr: 'Français',
  };
  const LABELS_EN = {
    en: 'English',
    ar: 'Arabic',
    ur: 'Urdu',
    id: 'Indonesian',
    bn: 'Bengali',
    hi: 'Hindi',
    tr: 'Turkish',
    fa: 'Persian',
    ms: 'Malay',
    fr: 'French',
  };

  // Canonical English strings. Any key referenced by code or markup MUST
  // exist here — translation files only override what they cover and fall
  // back to this baseline for missing keys.
  const EN = {
    'app.title': 'JummaTime',
    'app.pageTitle': 'JummaTime — Jummah Times Near You',
    'app.pageDescription': 'Find your masjid\'s Friday congregation times, compare Jummah sessions, get directions and set a reminder before iqamah.',
    'auth.signIn': 'Sign in or sign up',
    'auth.signOut': 'Sign out',
    'share.button': 'Share App on WhatsApp',
    'share.aria': 'Share JummaTime with someone',
    'share.title': 'JummaTime',
    'share.message': 'Assalamu alaikum, I use JummaTime to find exact Jummah and jamaat times near masjids.\nWebsite: https://jummatime.com/app/',
    'lang.label': 'Language',
    'lang.aria': 'Choose language',
    'lang.eyebrow': 'Language',
    'lang.choose': 'Choose your language',
    'account.eyebrow': 'Account',
    'account.title': 'Signed in',
    'account.openAria': 'Open account menu',
    'account.follower': 'follower',
    'account.followers': 'followers',

    'hero.kicker': 'Friday prayer at your local masjid',
    'hero.headlineHtml': 'Find <em>Jummah times</em> near you.',
    'hero.subhead': 'Find Friday congregation times, choose your masjid, and arrive before the iqamah.',

    'next.eyebrow': 'Your default masjid',
    'next.eyebrowNearest': 'Showing nearest masjid',
    'next.at': 'at',
    'next.reminders': 'Reminders',
    'next.bell': 'Remind me',
    'next.bellCount': '{n} reminders',
    'next.bellOpenAria': 'Open reminder settings',
    'next.flipAria': 'Toggle all reminders on or off',
    'nav.navigate': 'Navigate to Masjid',
    'nav.navigateTo': 'Open directions to {name} in Google Maps',
    'nav.unavailable': 'Location is unavailable for this masjid.',
    'card.beFirst': 'Be the first to add Jummah time',
    'card.closed': 'Permanently closed masjid',
    'card.closedVoting': 'Keeper voting stays open in case the community needs to correct this.',
    'card.makeDefault': 'Set as default',
    'card.isDefault': '✓ Default',
    'toast.sessionExpired': 'Your session expired. Please sign in again.',
    'next.refresh': 'Refresh times',
    'next.refreshAria': 'Pull the latest jamat times from the server',
    'next.refreshOk': 'Times updated.',
    'next.refreshOffline': "Offline — couldn't reach the server.",
    'next.refreshFail': "Couldn't refresh: {err}",
    'mosque.unnamed': 'Unnamed masjid',
    'map.popupOpen': 'Open details →',
    'next.empty': 'No masjid selected yet',
    'next.emptyHint': 'Tap a masjid below and choose “Make this my default”.',
    'next.emptyAnonName': 'Find a masjid nearby',
    'next.emptyAnonHint': 'Tap “Find the next Jummah near me” below to see your local options.',
    'next.findNearby': 'Find nearby masjid',
    'next.byKeeper': 'Times by',
    // Timetable photo scan ("Take a pic" on the hero card)
    'scan.takePic': 'Take a pic',
    'scan.aria': 'Take a picture of the masjid timetable board',
    'scan.enterYourself': 'Enter the time yourself',
    'scan.enterAria': "Type this masjid's jamat times yourself",
    'scan.reading': 'Reading the timetable…',
    'scan.failed': 'Could not read the timetable. Try a closer, straighter photo.',
    'scan.unavailable': 'Photo reading is not available on this server yet.',
    'scan.summaryTitle': 'Read from your photo',
    'scan.unchanged': 'unchanged',
    'scan.unread': 'not on board',
    'scan.boardClock': 'Board clock {board} · your phone {phone} ({drift})',
    'scan.driftNone': 'clocks match',
    'scan.driftAhead': 'board {n} min ahead',
    'scan.driftBehind': 'board {n} min behind',
    'scan.nothingRead': 'No times could be read from the photo. Try again closer and straight-on.',
    'scan.notesPrefix': 'Read from a photo of the masjid timetable board',
    'scan.done': 'Photo read. Check the times below, then tap Submit.',
    'scan.signIn': 'scan the timetable',
    'scan.signInEnter': 'enter the times',
    'scan.check': 'check',
    'scan.ignoredRows': 'Ignored rows: {rows}',
    'scan.outsideWindow': 'not in the {prayer} window',
    'scan.copyToJummah': 'Friday board? copy Dhuhr to Jummah',
    'scan.clockUnconfirmed': 'Board clock could not be confirmed — check every time',
    'scan.reason.outsideWindow': 'not in the {prayer} window',
    'scan.reason.jummah': 'Jummah rarely changes — confirm',
    'scan.reason.alt': 'two readings possible, showing the plausible one',
    'scan.reason.oddMinutes': 'unusual minute value',
    'scan.reason.bigChange': 'differs from the current time by {n} min',
    'scan.reason.lowDigits': 'digits unclear',
    // In-app viewfinder (js/timetable-capture.js)
    'scan.guide': 'Fit the board inside the frame. Hold still.',
    'scan.shutter': 'Take a pic',
    'scan.cancel': 'Cancel',
    'scan.capturing': 'Hold still…',
    'scan.cameraDenied': 'Camera permission is needed to photograph the board. You can still pick a photo from your gallery.',
    'scan.applied': "Applied to the masjid's times — you were at the masjid. The time keeper has been told.",
    'scan.tooFar': 'You were {m} m from the masjid, so this goes to the time keeper for review.',
    'next.allKeepers': 'Time keepers',
    'next.manageKeepers': 'Choose time keeper',
    'next.currentKeeper': 'current',
    'next.topRatedShort': 'top rated',
    'next.noFollowers': 'No followers yet',
    'next.oneFollower': '1 follower',
    'next.manyFollowers': '{n} followers',
    'next.label': 'Next Jummah in masjid:',
    'next.in': 'in',
    'next.unitH': 'hr',
    'next.unitM': 'min',
    'next.unitS': 'sec',
    'next.jummahFirst': 'Friday congregations',
    'next.allTimes': 'Jummah and daily times',
    'next.allTimesToday': 'Jummah and daily times',
    'next.colJamat': 'Jamat',
    'next.colStarts': 'Starts',
    'next.colEnds': 'Ends',
    'next.tag': 'Next',
    'next.prayersWord': 'prayers',
    'next.noTimes': 'Jummah time not added yet. Add the masjid\'s Friday time.',
    'card.openJummah': 'Open for Jummah times',
    'contributors.empty': 'No timings recorded yet.',
    'dist.meters': '{n} m away',
    'dist.km': '{n} km away',
    'nav.go': 'Go',

    'reminders.line1Html': 'Ring me before each jamat. Set <strong>0</strong> to skip a prayer.',
    'reminders.fridayHintHtml': '<em>Jummah replaces Dhuhr on Fridays — set both, the right one fires for the day.</em>',
    'reminders.minBefore': 'min before',
    'reminders.minBeforeFri': 'min before · Fri only',
    'reminders.save': 'Save',
    'reminders.test': 'Test ring',
    'reminders.off': 'Turn all off',
    'reminders.toggleAria': 'Enable {prayer} reminder',
    'reminders.notifTitle': '{prayer} at {mosque}',
    'reminders.notifBody': 'Jamat in {n} min (at {time}). Time to head out.',

    'prayer.fajr': 'Fajr',
    'prayer.dhuhr': 'Dhuhr',
    'prayer.asr': 'Asr',
    'prayer.maghrib': 'Maghrib',
    'prayer.isha': 'Isha',
    'prayer.jummah': 'Jummah',
    'prayer.jummah_2': 'Jummah 2',
    'prayer.jummah_3': 'Jummah 3',

    'qaza.pill': 'Qaza Namaz Tracker',

    'quick.locate': 'Find the next Jummah near me',
    'quick.openMap': 'Open map',

    'appDownload.kicker': 'JummaTime mobile app',
    'appDownload.title': 'Know Jummah before you leave.',
    'appDownload.body': 'Download the Android app to find nearby Jummah times, follow trusted time keepers, and set prayer reminders that ring even when the app is closed.',
    'appDownload.pointMap': 'Jummah-first map and list cards',
    'appDownload.pointReminders': 'Native reminders before Jummah and each jamat',
    'appDownload.pointCommunity': 'Crowd-sourced updates from local time keepers',
    'appDownload.play': 'Get it on Google Play',
    'appDownload.playAria': 'Download JummaTime from Google Play',
    'appDownload.watch': 'Watch the app demo',
    'appDownload.shotHome': 'Home',
    'appDownload.shotTimes': 'Times',
    'appDownload.shotReminders': 'Reminders',
    'appDownload.shotMap': 'Map',
    'appDownload.shotSun': 'Salah',
    'appDownload.shotDirectory': 'Directory',

    'intent.kicker': 'Built for Jummah discovery',
    'intent.title': 'Find the next Jummah, then every jamat time.',
    'intent.body': 'Most people open the app because they need Friday prayer time now. JummaTime puts Jummah at the top of masjid cards, then keeps the rest of Fajr, Dhuhr, Asr, Maghrib, and Isha close behind.',
    'intent.worshippersTitle': 'For worshippers',
    'intent.worshippersBody': 'Find “Jummah time near me,” check the next iqamah at your default masjid, and set reminders before jamaat.',
    'intent.timekeepersTitle': 'For timekeepers',
    'intent.timekeepersBody': 'Publish accurate masjid prayer times, receive suggested corrections, and let followers know when timings change.',
    'intent.developersTitle': 'For masjid websites',
    'intent.developersBody': 'Use the open API to show crowd-sourced jamaat and Jummah times on your own site or community display.',

    'recent.title': 'Recently added',
    'recent.sub': 'Fresh contributions from the directory',

    'dir.tabBrowse': 'Browse',
    'dir.tabFavorites': 'Favorites',
    'dir.searchPh': 'Search masjid, city, or Jummah time…',
    'dir.empty': 'Nothing to show here.',
    'dir.emptyLocate': 'Find masjids near you →',

    'map.title': 'Masjids near you',
    'map.addBtn': 'Add a masjid',
    'map.addTitle': 'Add a masjid to the directory',
    'map.closeAria': 'Close map',
    'map.addingAt': 'Adding a masjid at',
    'map.tapHint': 'Tap the map where the masjid is located.',
    'map.cancel': 'cancel',

    'add.name': 'Name',
    'add.namePh': 'e.g. Masjid Al-Falah',
    'add.city': 'City',
    'add.cityPh': 'e.g. Lahore',
    'add.country': 'Country',
    'add.countryPh': 'e.g. Pakistan',
    'add.address': 'Address',
    'add.addressPh': 'optional — e.g. Block 4, Garden Town',
    'add.submit': 'Add masjid',
    'add.cancel': 'Cancel',

    'drawer.closeAria': 'Close',
    'drawer.today': "Today's jamat",
    'drawer.byKeeper': 'Times by',
    'keeper.switch': 'Switch',
    'drawer.empty': 'No jamat times recorded for this masjid yet.',
    'drawer.emptyLead': 'Be the first to add jamat times here.',
    'drawer.emptySub': 'Earn ajar for every prayer prayed using your timings.',
    'drawer.beFirst': '+ Submit jamat times',
    'drawer.jummaTitle': 'Only know Jummah? Start there.',
    'drawer.jummaSub': 'It rarely changes - most-searched by travellers. Easy ajar every week.',
    'drawer.jummaCta': '+ Add',
    'drawer.statusCommunity': 'Community masjid',
    'drawer.statusDefault': 'Your default',
    'drawer.statusMasjid': 'Masjid',
    'drawer.distanceUnknown': 'nearby',
    'drawer.distanceVeryClose': 'right here',
    'drawer.renameAria': 'Name this masjid',
    'drawer.defaultActive': '✓ Your default masjid',
    'drawer.keepers': 'Time keepers',
    'drawer.keepersHint': "Each card is one contributor's latest timing record for this masjid. Current powers today's table. Top rated uses votes, recency, verification, and contribution history. Follow a keeper to use their times for reminders; Suggest update sends them a correction. Maghrib is not shown here because JummaTime calculates it from sunset plus the masjid offset.",
    'drawer.keepersGuideTitle': 'Default: highest-rated time keeper',
    'drawer.keepersGuideBody': "Your app uses the default keeper's timings for this masjid. A masjid can have several time keepers; to use someone else's provided timings, scroll down and tap \"Use this time keeper's timings\" on that card.",
    'drawer.keepersGuideRating': "Ratings use votes, recent updates, verification, contribution history, and follower trust. Followers show how many people use that keeper's timings.",
    'drawer.amenities': 'Amenities',
    'drawer.favSave': 'Save to favorites',
    'drawer.favSaved': 'Saved',
    'drawer.makeDefault': 'Make this my default',
    'drawer.submitUpdate': 'Submit a timing update',
    'drawer.submitTimes': 'Submit Jamat times',
    'drawer.closedForever': 'Report: this masjid has closed permanently',
    'drawer.recent': 'Recent submissions',
    'drawer.loading': 'Loading…',
    'drawer.noContrib': 'No submissions yet.',

    'submit.title': 'Submit a timing update',
    'submit.titleNew': 'Submit Jummah or jamat times',
    'submit.titleUpdate': 'Submit a timing update',
    'submit.note': 'Maghrib follows local sunset — pick the takbeer offset. Other times in 24-hour · HH:mm',
    'submit.noteNew': 'Start with Jummah. Leave unknown daily times blank - travellers are often looking for Jummah times nearby.',
    'submit.noteUpdate': 'Maghrib follows local sunset — pick the takbeer offset. Other times in 24-hour · HH:mm',
    'submit.maghribLabel': 'Maghrib offset',
    'submit.offsetAt': 'at sunset',
    'submit.offsetPlus': '+{n} min',
    'submit.notes': 'Notes (optional)',
    'submit.notesPh': 'e.g. winter schedule, board outside main entrance',
    'submit.send': 'Submit',
    'submit.cancel': 'Cancel',

    'keepers.bannerBody1': 'Your app uses the',
    'keepers.bannerBody2': 'highest-rated keeper',
    'keepers.bannerBody3': 'by default. Switch by tapping',
    'keepers.bannerBody4': 'on any card.',
    'keepers.useThese': 'Use these times',
    'keepers.updateTimes': 'Update times',
    'keepers.currentlyUsing': '✓ Currently using',
    'keepers.updated': 'Updated',
    'keepers.voteUp': 'Mark this keeper as helpful',
    'keepers.voteDown': 'Mark this keeper as unhelpful',
    'keepers.stopBeingKeeper': 'Stop being time keeper here',
    'keepers.suggestCorrection': 'Suggest a correction',
    'keepers.become': 'Become a time keeper here',

    'amenities.title': 'Masjid details',
    'amenities.eyebrow': 'community-rated',
    'amenities.rate': 'Rate this masjid',
    'amenities.noRatings': 'Not rated yet',
    'amenities.size': 'Size',
    'amenities.sizeMeta': 'capacity & space',
    'amenities.wudu': 'Wudu area',
    'amenities.wuduMeta': 'cleanliness & flow',
    'amenities.washrooms': 'Washrooms',
    'amenities.washroomsMeta': 'cleanliness',
    'amenities.accessibility': 'Accessibility',
    'amenities.accessibilityMeta': 'ramps & seating',
    'amenities.ratingEyebrow': 'Masjid rating',
    'amenities.ratingTitle': 'Rate this masjid',
    'amenities.ratingCategory': 'Category',
    'amenities.ratingSave': 'Save rating',

    'stale.title': 'These timings look stale',
    'stale.nudgePrefix': 'Nudge',
    'stale.nudgeSuffix': 'to refresh them — or submit your own.',
    'stale.cta': 'Nudge',
    'nudge.eyebrow': 'Suggest an update',
    'nudge.toPrefix': 'To',
    'nudge.title': 'Suggest the right times',
    'nudge.lede': 'Tap any prayer to propose a new time. Leave them as-is to just send a heads-up.',
    'nudge.changesProposed': 'changes proposed',
    'nudge.willSee': 'will see the diff',
    'nudge.becomeTitle': 'I want to become a time keeper · earn ajar',
    'nudge.becomeSub': 'Submit your own timings — every prayer prayed earns ajar for you.',
    'nudge.send': 'Send nudge',
    'nudge.cancel': 'Cancel',
    'nudge.sentBody': '{name} will be notified.',
    'nudge.timeEyebrow': 'Edit time',
    'nudge.currentTime': 'Current',
    'nudge.newTime': 'New time',
    'nudge.applyTime': 'Apply',
    'nudge.clearTime': 'Clear',

    'sun.title': 'Salah by sun position',
    'sun.fiqh': 'Fiqh',
    'sun.fiqh.hanafi': 'Hanafi',
    'sun.fiqh.shafi': "Shafi'i",
    'sun.fiqh.maliki': 'Maliki',
    'sun.fiqh.hanbali': 'Hanbali',
    'sun.fiqh.jafari': 'Jafari (Shia)',
    'sun.fiqh.isna': 'ISNA (N. America)',
    'sun.fiqh.egypt': 'Egyptian Authority',
    'sun.fiqh.ummalqura': 'Umm al-Qura',
    'sun.locate': 'Use my location',
    'sun.locHint': "Computed from your phone's GPS location.",
    'sun.coordsHint': 'For your location · {lat}, {lng}',
    'sun.sunrise': 'Sunrise',

    'inbox.bannerOne': '1 timing suggestion is waiting for your review',
    'inbox.bannerMany': '{n} timing suggestions are waiting for your review',
    'inbox.review': 'Review',
    'inbox.title': 'Suggested timing updates',
    'inbox.body': 'Users have suggested new times for masjids you keep. Accept to update your record (everyone following you will see the new times) or decline.',
    'inbox.from': 'from',
    'inbox.at': 'at',
    'inbox.accept': 'Accept',
    'inbox.decline': 'Decline',
    'inbox.empty': 'Inbox is empty.',
    'inbox.alertsTitle': 'Phone alerts are off',
    'inbox.alertsBody': 'Requests remain available in this inbox. Enable phone alerts to be notified when JummaTime is closed.',
    'inbox.alertsDeniedTitle': 'Phone notifications are blocked',
    'inbox.alertsDeniedBody': 'Requests remain available in this inbox. Allow notifications in Android settings for alerts when JummaTime is closed.',
    'inbox.alertsEnable': 'Enable alerts',
    'inbox.alertsSettings': 'Open settings',
    'inbox.alertsEnabledToast': 'Suggestion alerts enabled',
    'inbox.alertsQueuedToast': 'Alerts will turn on after notification permission is granted',
    'inbox.alertsDeniedToast': 'Notifications are blocked. Enable them in Android settings.',
    'inbox.alertsSettingsHint': 'Open Android Settings → Apps → JummaTime → Notifications to enable alerts.',
    'inbox.acceptedToast': 'Accepted — your record now uses these times',
    'inbox.declinedToast': 'Declined',

    'keeperIntro.eyebrow': 'Time keeper ratings',
    'keeperIntro.title': 'One masjid can have several time keepers.',
    'keeperIntro.body': 'JummaTime chooses the highest-rated time keeper by default, so the app starts with the timings most likely to be trusted.',
    'keeperIntro.rating': 'Rating uses votes, fresh updates, verification, contribution history, and keeper trust.',
    'keeperIntro.followers': "Followers show how many people use that keeper's timings.",
    'keeperIntro.choose': 'To use someone else\'s timings, open a masjid, scroll to Time keepers, and tap "Use this time keeper\'s timings."',
    'keeperIntro.ok': 'I understand',

    'keeper.useTimings': "Use this time keeper's timings",
    'keeper.stopUsingTimings': "Stop using this time keeper's timings",
    'keeper.sourcePreferred': 'You are using timings provided by this time keeper',
    'keeper.sourceDefault': 'Default highest-rated time keeper - these timings are used now',
    'keeper.sourceCurrent': 'Current masjid schedule - these timings are used now',
    'keeper.sourceVerifiedHistory': 'Verified previous schedule from this time keeper',
    'keeper.sourceScheduleHistory': 'Previous schedule from this time keeper',
    'keeper.sourceSubmission': 'Timing submission from this time keeper',
    'keeper.selfUpdate': 'Update the timings I provide',
    'keeper.withdraw': 'Stop being time keeper for this masjid',
    'keeper.withdrawConfirm': 'This will remove your timings from this masjid and people will no longer be able to follow you here. Continue?',
    'keeper.hint.tapChangeUpdated': 'Tap to change · Updated {date}',
    'keeper.hint.tapChange': 'Tap to change keeper',
    'keeper.hint.verifiedUpdated': 'Verified schedule · Updated {date}',
    'keeper.hint.verified': 'Verified schedule',
    'keeper.hint.currentUpdated': 'Current schedule · Updated {date}',
    'keeper.hint.current': 'Current schedule',
    'keeper.hint.historyUpdated': 'Schedule history · Updated {date}',
    'keeper.hint.history': 'Schedule history',
    'keeper.hint.topUpdated': 'Top trusted · Updated {date}',
    'keeper.hint.top': 'Top trusted',

    'suggest.title': 'Suggest a timing update',
    'suggest.target': 'To {name}',
    'suggest.notes': 'Note to the keeper (optional)',
    'suggest.notesPh': 'e.g. Ramadan schedule starts tomorrow',
    'suggest.send': 'Send suggestion',
    'suggest.button': 'Suggest a correction to this keeper',
    'suggest.toastSent': 'Suggestion sent to {name}',
    'suggest.toastFail': 'Could not send: {err}',

    'login.title': 'Sign in or sign up',
    'login.body': 'Continue with Google, or enter your email and password. New email accounts require your confirmation.',
    'login.signupBody': 'A new account will be created for this email address:',
    'login.signupConfirm': 'Yes, create my account',
    'login.signupCancel': 'I mistyped my email',
    'login.signupCheckFailed': 'Could not check this email. Please try again.',
    'login.existingAccount': 'That email already has an account. Check your password or continue with Google.',
    'login.emailPh': 'you@example.com',
    'login.passwordPh': 'Password',
    'login.passwordHint': '8+ characters. Email-only sign-in is available in local development only.',
    'login.passwordHintProd': 'Use your password, or continue with Google if available.',
    'login.passwordRequired': 'Enter your password to sign in.',
    'login.continue': 'Continue',
    'login.google': 'Continue with Google',
    'login.or': 'or with email',

    'footer.noAds': 'No ads. Ever.',
    'footer.sadqaArabic': 'صدقة في سبيل الله',
    'footer.sadqaTrans': 'This initiative is sadqa fe sabilillah.',
    'footer.sadqaJariaHtml': '<strong>This is sadqa jaria.</strong> <a href="https://takbeertime.com/api-docs.html" target="_blank" rel="noopener">The API</a> is open — call it from your own app, your masjid\'s website, anywhere a jamat time is needed. One shared database, kept by volunteer timekeepers — please use the API rather than copy the data, so their work reaches everyone. There\'s an angel out there counting every API hit. Not us.',
    'footer.colophon': 'Built for the ummah · Open source',
    'footer.apiDocs': 'API for developers',

    'toast.signedIn': 'Welcome, {name}',
    'toast.signedOut': 'Signed out',
    'toast.submissionReceived': 'Submission received — thank you',
    'toast.atLeastOne': 'Enter at least one timing',
    'toast.favSaved': 'Saved {name}',
    'toast.favRemoved': 'Removed from favorites',
    'toast.defaultSet': 'Set as your default',
    'toast.locating': 'Locating…',
    'toast.locateFail': "Couldn't find your location. Check browser permissions.",
    'toast.submitFail': 'Submission failed: {err}',
    'toast.favFail': 'Favorite failed: {err}',
  };

  let current = 'en';
  let strings = EN;
  let jummaCopy;

  function loadJummaCopy() {
    if (!jummaCopy) {
      jummaCopy = fetch('/app/data/jumma-copy.json?v=1')
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .catch(error => { console.warn('Could not load Jummah translations', error); return {}; });
    }
    return jummaCopy;
  }

  function detect() {
    const explicit = new URLSearchParams(location.search).get('lang') || document.documentElement.dataset.appLanguage;
    if (SUPPORTED.includes(explicit)) return explicit;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
    const nav = (navigator.language || 'en').toLowerCase();
    const short = nav.split('-')[0];
    if (SUPPORTED.includes(short)) return short;
    return 'en';
  }

  async function load(lang) {
    const copy = await loadJummaCopy();
    Object.assign(EN, copy.en || {});
    if (lang === 'en') {
      strings = EN;
      current = 'en';
    } else {
      try {
        const res = await fetch(`/app/i18n/${lang}.json?v=29`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        // Layer the fetched strings over the EN baseline so untranslated
        // keys still render in English instead of showing the raw key.
        strings = { ...EN, ...j, ...(copy[lang] || {}) };
        current = lang;
      } catch (e) {
        console.warn(`i18n: failed to load ${lang}, falling back to en`, e);
        strings = EN;
        current = 'en';
      }
    }
    document.documentElement.lang = current;
    document.documentElement.dir = RTL.has(current) ? 'rtl' : 'ltr';
  }

  function t(key, params) {
    const v = strings[key] ?? EN[key] ?? key;
    if (!params) return v;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
  }

  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(el => {
      const raw = el.getAttribute('data-i18n');
      // `key:html` lets a few strings carry inline markup (<em>, <strong>).
      if (raw.endsWith(':html')) {
        el.innerHTML = t(raw.slice(0, -5));
      } else {
        el.textContent = t(raw);
      }
    });
    r.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    r.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    r.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    // Page title comes from the same key as the meta-title above the fold.
    document.title = t('app.pageTitle');
    ['meta[property="og:title"]', 'meta[name="twitter:title"]'].forEach(selector => {
      const meta = document.querySelector(selector);
      if (meta) meta.setAttribute('content', document.title);
    });
    const description = t('app.pageDescription');
    [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ].forEach(selector => {
      const meta = document.querySelector(selector);
      if (meta) meta.setAttribute('content', description);
    });
  }

  async function set(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'en';
    await load(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    const url = new URL(location.href);
    if (url.searchParams.has('lang') || document.documentElement.dataset.appLanguage) {
      url.searchParams.set('lang', lang);
      history.replaceState(history.state, '', url);
    }
    apply();
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  async function init() {
    await load(detect());
    apply();
  }

  return {
    init, set, t, apply,
    current: () => current,
    supported: () => SUPPORTED.slice(),
    label: (l) => LABELS[l] || l,
    labelEn: (l) => LABELS_EN[l] || l,
    isRTL: () => RTL.has(current),
    isRTLCode: (l) => RTL.has(l),
  };
})();
