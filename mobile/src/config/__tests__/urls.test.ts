import { buildAlertsWsUrl, buildLivePlayerUrl, defaultsFromDevHost, normalizeBaseUrl } from '../urls';

describe('normalizeBaseUrl', () => {
  it('trims spaces and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://192.168.1.20:8000/api/v1///  ')).toBe(
      'http://192.168.1.20:8000/api/v1',
    );
  });

  it('adds http:// when the scheme is missing', () => {
    expect(normalizeBaseUrl('192.168.1.20:8889')).toBe('http://192.168.1.20:8889');
  });

  it('keeps https', () => {
    expect(normalizeBaseUrl('https://vms.example.com/api/v1/')).toBe(
      'https://vms.example.com/api/v1',
    );
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeBaseUrl('   ')).toBe('');
  });
});

describe('buildAlertsWsUrl', () => {
  it('uses ws:// for an http API', () => {
    expect(buildAlertsWsUrl('http://192.168.1.20:8000/api/v1')).toBe(
      'ws://192.168.1.20:8000/api/v1/alerts/ws',
    );
  });

  it('uses wss:// for an https API', () => {
    expect(buildAlertsWsUrl('https://vms.example.com/api/v1/')).toBe(
      'wss://vms.example.com/api/v1/alerts/ws',
    );
  });
});

describe('buildLivePlayerUrl', () => {
  it('joins the MediaMTX base URL and the camera live path', () => {
    expect(buildLivePlayerUrl('http://192.168.1.20:8889/', '/cam_north_01_annotated')).toBe(
      'http://192.168.1.20:8889/cam_north_01_annotated',
    );
  });
});

describe('defaultsFromDevHost', () => {
  it('derives API and MediaMTX URLs from the Expo dev server host', () => {
    expect(defaultsFromDevHost('192.168.1.20:8081')).toEqual({
      apiUrl: 'http://192.168.1.20:8000/api/v1',
      mediamtxUrl: 'http://192.168.1.20:8889',
    });
  });

  it('returns null without a host', () => {
    expect(defaultsFromDevHost(undefined)).toBeNull();
  });
});
