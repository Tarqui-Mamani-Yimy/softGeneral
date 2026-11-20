import { ApiError, createApiClient } from '../client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
  } as Response;
}

describe('createApiClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('prefixes the base URL and sends the bearer token as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createApiClient({
      getBaseUrl: () => 'http://10.0.0.5:8000/api/v1/',
      getToken: () => 'abc',
      onUnauthorized: jest.fn(),
    });

    const result = await client.request<{ ok: boolean }>('alerts', { method: 'POST', body: '{}' });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://10.0.0.5:8000/api/v1/alerts');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer abc',
      'Content-Type': 'application/json',
    });
  });

  it('omits the Authorization header without a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const client = createApiClient({
      getBaseUrl: () => 'http://h/api/v1',
      getToken: () => null,
      onUnauthorized: jest.fn(),
    });

    await client.request('/health');

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('throws ApiError with the backend detail and calls onUnauthorized on 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid credentials' }));
    const onUnauthorized = jest.fn();
    const client = createApiClient({
      getBaseUrl: () => 'http://h/api/v1',
      getToken: () => 'expired',
      onUnauthorized,
    });

    await expect(client.request('/auth/me')).rejects.toEqual(
      new ApiError(401, 'Invalid credentials'),
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call onUnauthorized when the login itself fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid credentials' }));
    const onUnauthorized = jest.fn();
    const client = createApiClient({
      getBaseUrl: () => 'http://h/api/v1',
      getToken: () => null,
      onUnauthorized,
    });

    await expect(client.request('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('reports a network error as ApiError with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const client = createApiClient({
      getBaseUrl: () => 'http://h/api/v1',
      getToken: () => null,
      onUnauthorized: jest.fn(),
    });

    await expect(client.request('/health')).rejects.toMatchObject({ status: 0 });
  });

  it('fails clearly when no server is configured', async () => {
    const client = createApiClient({
      getBaseUrl: () => '',
      getToken: () => null,
      onUnauthorized: jest.fn(),
    });

    await expect(client.request('/health')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
