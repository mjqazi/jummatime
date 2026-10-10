const fs = require('fs');
const path = require('path');

const TOPIC = 'suggest-to-test-keeper';
const TOPICS_KEY = 'takbeer_fcm_topics_v1';
const PENDING_KEY = 'takbeer_fcm_pending_v1';
const bridge = fs.readFileSync(path.join(__dirname, '../../mobile/native-bridge.js'), 'utf8');

describe('native nudge delivery', () => {
  let Push, FCM;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('takbeer_first_perm_v1', '1');
    Push = {
      checkPermissions: jest.fn().mockResolvedValue({ receive: 'granted' }),
      requestPermissions: jest.fn().mockResolvedValue({ receive: 'granted' }),
      register: jest.fn().mockResolvedValue(),
      createChannel: jest.fn().mockResolvedValue(),
      listChannels: jest.fn().mockResolvedValue({ channels: [{ id: 'keeper-updates', importance: 4 }] }),
      addListener: jest.fn().mockResolvedValue({ remove: async () => {} }),
    };
    FCM = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
      subscribeTo: jest.fn().mockResolvedValue(),
      unsubscribeFrom: jest.fn().mockResolvedValue(),
    };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: Push, FCM } };
    window.eval(bridge);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window.Capacitor;
    delete window.takbeerPush;
    delete window.takbeerPermissions;
    delete window.JAMAT_CONFIG;
  });

  test('does not claim registration success before a real token is returned', async () => {
    let finishToken;
    FCM.getToken.mockImplementationOnce(() => new Promise(resolve => { finishToken = resolve; }));
    const subscription = window.takbeerPush.subscribe(TOPIC);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(Push.register).toHaveBeenCalled();
    expect(FCM.subscribeTo).not.toHaveBeenCalled();
    expect((await window.takbeerPush.status(TOPIC)).registered).toBe(false);
    finishToken({ token: 'test-token' });
    expect(await subscription).toBe(true);
    expect((await window.takbeerPush.status(TOPIC)).subscribed).toBe(true);
  });

  test('queues a failed token request and registers again when connectivity recovers', async () => {
    FCM.getToken.mockRejectedValueOnce(new Error('SERVICE_NOT_AVAILABLE'));
    expect(await window.takbeerPush.subscribeWhenPermitted(TOPIC)).toBe(false);
    expect(await window.takbeerPush.status(TOPIC)).toMatchObject({ registered: false, pending: true, subscribed: false });
    expect(await window.takbeerPush.flushPending()).toBe(true);
    expect(Push.register).toHaveBeenCalledTimes(2);
    expect(FCM.subscribeTo).toHaveBeenCalledWith({ topic: TOPIC });
    expect(Push.requestPermissions).not.toHaveBeenCalled();
  });

  test('reasserts restored topics and subscribes again after a token changes', async () => {
    localStorage.setItem(TOPICS_KEY, JSON.stringify([TOPIC]));
    expect((await window.takbeerPush.status(TOPIC)).subscribed).toBe(false);
    await window.takbeerPush.flushPending();
    FCM.getToken.mockResolvedValue({ token: 'replacement-token' });
    await window.takbeerPush.flushPending();
    expect(FCM.subscribeTo).toHaveBeenCalledTimes(2);
    expect((await window.takbeerPush.status(TOPIC)).subscribed).toBe(true);
  });

  test('keeps a failed subscription queued and retries it', async () => {
    FCM.subscribeTo.mockRejectedValueOnce(new Error('offline'));
    expect(await window.takbeerPush.subscribe(TOPIC)).toBe(false);
    expect((await window.takbeerPush.status(TOPIC)).pending).toBe(true);
    expect(await window.takbeerPush.flushPending()).toBe(true);
    expect((await window.takbeerPush.status(TOPIC)).pending).toBe(false);
  });

  test('does not lose another topic queued during a slow native subscription', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify([TOPIC]));
    let finishSubscribe;
    FCM.subscribeTo.mockImplementationOnce(() => new Promise(resolve => { finishSubscribe = resolve; }));
    const flush = window.takbeerPush.flushPending();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    Push.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    await window.takbeerPush.subscribeWhenPermitted('keeper-second-mosque');
    finishSubscribe();
    expect(await flush).toBe(false);
    expect(JSON.parse(localStorage.getItem(PENDING_KEY))).toEqual(['keeper-second-mosque']);
  });

  test('does not report alerts enabled when Android permission or the channel is blocked', async () => {
    await window.takbeerPush.subscribe(TOPIC);
    Push.checkPermissions.mockResolvedValue({ receive: 'denied' });
    expect((await window.takbeerPush.status(TOPIC)).subscribed).toBe(false);
    Push.checkPermissions.mockResolvedValue({ receive: 'granted' });
    Push.listChannels.mockResolvedValue({ channels: [{ id: 'keeper-updates', importance: 0 }] });
    expect(await window.takbeerPush.status(TOPIC)).toMatchObject({ subscribed: false, channelBlocked: true });
  });
});
