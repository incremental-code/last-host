import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRoutePath,
  defaultRouteHost,
  normalizeBasePath,
  normalizeRouteMode,
  publicUrlForRoute,
  renderCaddyConfig,
  renderPathHandle,
  renderPathRoutes,
  renderReverseProxyBlock,
  resolveRouteFromUrl,
  renderCustomDomainRoute,
  renderDefaultRoute,
} from '../caddy.js';

test('default route host composes app org and host', () => {
  assert.equal(
    defaultRouteHost({ host: 'LastJS.org', org: 'Acme', app: 'Store Front' }),
    'store-front.acme.lastjs.org',
  );
});

test('default route path composes org and app', () => {
  assert.equal(defaultRoutePath({ org: 'Acme', app: 'Store Front' }), '/acme/store-front');
});

test('render default subdomain route block', () => {
  const block = renderDefaultRoute({
    host: 'lastjs.org',
    org: 'acme',
    app: 'shop',
    upstream: '127.0.0.1:3100',
  });
  assert.equal(block, 'shop.acme.lastjs.org {\n  reverse_proxy 127.0.0.1:3100\n}');
});

test('render custom domain route block', () => {
  const block = renderCustomDomainRoute({
    domain: 'Shop.example.com',
    upstream: '127.0.0.1:3100',
  });
  assert.equal(block, 'shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}');
});

test('render path handle strips matching prefix', () => {
  const block = renderPathHandle({
    pathPrefix: '/Demo/Ecommerce/',
    upstream: '127.0.0.1:3100',
  });
  assert.equal(block, 'handle_path /demo/ecommerce* {\n    reverse_proxy 127.0.0.1:3100\n  }');
});

test('render path routes sorts longest prefix first', () => {
  const block = renderPathRoutes({
    domain: 'lastjs.org',
    routes: [
      { pathPrefix: '/demo', upstream: '127.0.0.1:3000' },
      { pathPrefix: '/demo/ecommerce', upstream: '127.0.0.1:3100' },
    ],
  });
  assert.equal(
    block,
    [
      'lastjs.org {',
      '  handle_path /demo/ecommerce* {',
      '    reverse_proxy 127.0.0.1:3100',
      '  }',
      '',
      '  handle_path /demo* {',
      '    reverse_proxy 127.0.0.1:3000',
      '  }',
      '}',
    ].join('\n'),
  );
});

test('render complete caddy config for mixed routes', () => {
  const config = renderCaddyConfig({
    host: 'lastjs.org',
    apps: [
      {
        org: 'acme',
        app: 'shop',
        upstream: '127.0.0.1:3100',
        routeMode: 'both',
        customDomains: ['shop.example.com', 'www.shop.example.com'],
      },
      {
        org: 'demo',
        app: 'ecommerce',
        upstream: '127.0.0.1:3200',
        routeMode: 'path',
        basePath: '/demo/ecommerce',
      },
    ],
  });
  assert.equal(
    config,
    [
      'shop.acme.lastjs.org {\n  reverse_proxy 127.0.0.1:3100\n}',
      'shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}',
      'www.shop.example.com {\n  reverse_proxy 127.0.0.1:3100\n}',
      'lastjs.org {\n  handle_path /demo/ecommerce* {\n    reverse_proxy 127.0.0.1:3200\n  }\n\n  handle_path /acme/shop* {\n    reverse_proxy 127.0.0.1:3100\n  }\n}',
    ].join('\n\n') + '\n',
  );
});

test('route helpers normalize defaults', () => {
  assert.equal(normalizeBasePath('', { org: 'demo', app: 'ecommerce' }), '/demo/ecommerce');
  assert.equal(normalizeRouteMode('PATH'), 'path');
  assert.equal(normalizeRouteMode('custom'), 'custom');
  assert.equal(normalizeRouteMode('invalid'), 'subdomain');
});

test('publicUrlForRoute renders a single public URL', () => {
  assert.equal(
    publicUrlForRoute({ host: 'lastjs.org', org: 'demo', app: 'ecommerce', routeMode: 'subdomain' }),
    'https://ecommerce.demo.lastjs.org',
  );
  assert.equal(
    publicUrlForRoute({ host: 'lastjs.org', org: 'demo', app: 'ecommerce', routeMode: 'path', basePath: '/demo/ecommerce' }),
    'https://lastjs.org/demo/ecommerce',
  );
  assert.equal(
    publicUrlForRoute({ host: 'lastjs.org', org: 'demo', app: 'ecommerce', routeMode: 'custom', customDomain: 'Shop.Example.com' }),
    'https://shop.example.com',
  );
});

test('resolveRouteFromUrl infers subdomain, path, and custom routes', () => {
  assert.deepEqual(
    resolveRouteFromUrl({ url: 'https://ecommerce.demo.lastjs.org', host: 'lastjs.org', org: 'demo', app: 'ecommerce' }),
    { routeMode: 'subdomain', basePath: '', customDomain: '', url: 'https://ecommerce.demo.lastjs.org' },
  );
  assert.deepEqual(
    resolveRouteFromUrl({ url: 'https://lastjs.org/demo/ecommerce', host: 'lastjs.org', org: 'demo', app: 'ecommerce' }),
    { routeMode: 'path', basePath: '/demo/ecommerce', customDomain: '', url: 'https://lastjs.org/demo/ecommerce' },
  );
  assert.deepEqual(
    resolveRouteFromUrl({ url: 'shop.example.com', host: 'lastjs.org', org: 'demo', app: 'ecommerce' }),
    { routeMode: 'custom', basePath: '', customDomain: 'shop.example.com', url: 'https://shop.example.com' },
  );
});

test('resolveRouteFromUrl rejects unsupported URL shapes', () => {
  assert.throws(
    () => resolveRouteFromUrl({ url: 'https://lastjs.org/', host: 'lastjs.org', org: 'demo', app: 'ecommerce' }),
    /base host root is not a deployable app URL/,
  );
  assert.throws(
    () => resolveRouteFromUrl({ url: 'https://shop.example.com/demo', host: 'lastjs.org', org: 'demo', app: 'ecommerce' }),
    /custom domain URLs cannot include a path/,
  );
});

test('reverse proxy block validates required fields', () => {
  assert.throws(() => renderReverseProxyBlock({ domain: '', upstream: '127.0.0.1:3000' }), /domain is required/);
  assert.throws(() => renderReverseProxyBlock({ domain: 'shop.example.com', upstream: '' }), /upstream is required/);
  assert.throws(() => renderPathRoutes({ domain: '', routes: [{ pathPrefix: '/demo', upstream: '127.0.0.1:3000' }] }), /domain is required/);
});
