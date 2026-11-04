import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS,
  mediaProxyAllowedHosts,
  validateMediaUrl,
} from '../api/media-proxy.js';

test('accepts only the built-in CDN and Spaces origin over default-port HTTPS', () => {
  for (const host of DEFAULT_MEDIA_PROXY_ALLOWED_HOSTS) {
    const url = validateMediaUrl(`https://${host}:443/path/file.dxf?signature=a%2Fb`);
    assert.equal(url?.hostname, host);
    assert.equal(url?.port, '');
  }
});

test('rejects SSRF host tricks, credentials, non-HTTPS, and non-default ports', () => {
  const rejected = [
    'http://files.grbpwr.com/image.webp',
    'https://files.grbpwr.com.evil.example/image.webp',
    'https://sub.files.grbpwr.com/image.webp',
    'https://user:pass@files.grbpwr.com/image.webp',
    'https://@files.grbpwr.com/image.webp',
    'https://files.grbpwr.com:444/image.webp',
    'https://files.grbpwr.com./image.webp',
    'https://127.0.0.1/image.webp',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
  ];

  for (const rawUrl of rejected) assert.equal(validateMediaUrl(rawUrl), null, rawUrl);
});

test('environment allowlist replaces defaults and remains exact-host only', () => {
  const allowedHosts = mediaProxyAllowedHosts(' MEDIA.EXAMPLE.COM,patterns.example.com ');

  assert.ok(validateMediaUrl('https://media.example.com/a.webp', allowedHosts));
  assert.ok(validateMediaUrl('https://patterns.example.com/a.dxf', allowedHosts));
  assert.equal(validateMediaUrl('https://files.grbpwr.com/a.webp', allowedHosts), null);
  assert.equal(validateMediaUrl('https://sub.media.example.com/a.webp', allowedHosts), null);
});

const PATH_STYLE = 'https://fra1.digitaloceanspaces.com';

test('a path-style link passes as the bucket already on the list, with its signature intact', () => {
  const signed = `${PATH_STYLE}/grbpwr/grbpwr-com-beta/files-library/a.png?X-Amz-Signature=a%2Fb&response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27a.png`;
  assert.equal(validateMediaUrl(signed)?.href, signed);
});

test('a path-style link to anything else stays out', () => {
  const rejected = [
    `${PATH_STYLE}/other-bucket/a.png`,
    `${PATH_STYLE}/grbpwr`,
    `${PATH_STYLE}/grbpwr/`,
    `${PATH_STYLE}/grbpwr/?list-type=2`,
    `${PATH_STYLE}/`,
    `${PATH_STYLE}//grbpwr/a.png`,
    `${PATH_STYLE}/GRBPWR/a.png`,
    `${PATH_STYLE}/gr%62pwr/a.png`,
    `${PATH_STYLE}/grbpwr/../other-bucket/a.png`,
    `${PATH_STYLE}/grbpwr/%2e%2e/other-bucket/a.png`,
    `${PATH_STYLE}/grbpwr.evil.example/a.png`,
    `${PATH_STYLE}:444/grbpwr/a.png`,
    'http://fra1.digitaloceanspaces.com/grbpwr/a.png',
    'https://user:pass@fra1.digitaloceanspaces.com/grbpwr/a.png',
    'https://evil.fra1.digitaloceanspaces.com/grbpwr/a.png',
    'https://nyc3.digitaloceanspaces.com/grbpwr/a.png',
    'https://files.grbpwr.com.fra1.digitaloceanspaces.com/a.png',
  ];

  for (const rawUrl of rejected) assert.equal(validateMediaUrl(rawUrl), null, rawUrl);
});

test('the bucket a path-style link names must be on the list in force', () => {
  const custom = mediaProxyAllowedHosts('media.example.com');
  assert.equal(validateMediaUrl(`${PATH_STYLE}/grbpwr/a.png`, custom), null);

  const other = mediaProxyAllowedHosts('other-bucket.fra1.digitaloceanspaces.com');
  assert.ok(validateMediaUrl(`${PATH_STYLE}/other-bucket/a.png`, other));
  assert.equal(validateMediaUrl(`${PATH_STYLE}/grbpwr/a.png`, other), null);
});

test('the region host itself never joins the list by a path', () => {
  const hosts = mediaProxyAllowedHosts();
  assert.equal(hosts.has('fra1.digitaloceanspaces.com'), false);
  assert.equal(validateMediaUrl(`${PATH_STYLE}/a.png`), null);
});
