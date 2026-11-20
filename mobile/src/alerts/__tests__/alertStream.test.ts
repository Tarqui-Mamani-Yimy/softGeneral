import { AlertStreamClient, type AlertStreamStatus } from '../alertStream';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000) {
    this.onclose?.({ code });
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function setup() {
  FakeSocket.instances = [];
  const statuses: AlertStreamStatus[] = [];
  const alerts: unknown[] = [];
  const client = new AlertStreamClient({
    url: 'ws://h/api/v1/alerts/ws',
    token: 'tok',
    onStatus: (s) => statuses.push(s),
    onAlert: (a) => alerts.push(a),
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
  });
  return { client, statuses, alerts };
}

describe('AlertStreamClient', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends the auth frame on open and reports connected on ready', () => {
    const { client, statuses } = setup();
    client.start();
    const socket = FakeSocket.instances[0];

    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'auth', token: 'tok' });

    socket.receive({ type: 'ready' });
    expect(statuses.at(-1)).toBe('connected');
  });

  it('forwards alert messages and ignores malformed ones', () => {
    const { client, alerts } = setup();
    client.start();
    const socket = FakeSocket.instances[0];
    socket.open();

    socket.receive({ type: 'alert', alert: { id: 'a1' } });
    socket.onmessage?.({ data: 'not json' });

    expect(alerts).toEqual([{ id: 'a1' }]);
  });

  it('pings every 30 seconds after ready', () => {
    const { client } = setup();
    client.start();
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.receive({ type: 'ready' });

    jest.advanceTimersByTime(30000);

    expect(socket.sent.map((s) => JSON.parse(s).type)).toEqual(['auth', 'ping']);
  });

  it('reconnects with backoff after an abnormal close', () => {
    const { client, statuses } = setup();
    client.start();
    FakeSocket.instances[0].close(1006);

    expect(statuses.at(-1)).toBe('reconnecting');
    jest.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after a policy-violation close (bad token)', () => {
    const { client, statuses } = setup();
    client.start();
    FakeSocket.instances[0].close(1008);

    jest.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('disconnected');
  });

  it('stop() closes the socket and prevents reconnects', () => {
    const { client, statuses } = setup();
    client.start();
    client.stop();

    jest.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('disconnected');
  });
});
